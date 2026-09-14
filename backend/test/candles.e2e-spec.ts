/**
 * E2E слоя B2 — HTTP-шов тикета 03 (пустая история Candle) на локальный Postgres.
 *
 * Поднимает AppModule + configureApp (тот же pipe/Swagger, что prod).
 * Цепочка та же, что в коде: Query DTO → Controller → Service → Repository → Prisma.
 * Карта файлов — src/modules/candles/candles.module.ts.
 *
 * PrismaService НЕ мокаем: бьём в реальную БД dev-окружения.
 * Seed-символы (BTC, …) не truncate; свечи в seed нет — BTC+H4 даёт items: [].
 * Фикстуру неактивного Symbol (YYY) удаляем только её.
 *
 * Тикет 03: 200 пустой конверт, регистр ticker, 404 SYMBOL_NOT_FOUND, inactive → 200,
 *           400 whitelist / interval / пустые поля, query-поля в OpenAPI.
 *
 * Запуск: npm run test:e2e -- candles.e2e-spec.ts
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('GET /api/v1/candles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const inactiveFixture = {
    ticker: 'YYY',
    name: 'E2E Inactive Candles',
    coingeckoId: 'e2e-inactive-candles-symbol',
    vsCurrency: 'usd',
    isActive: false,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.symbol.upsert({
      where: { coingeckoId: inactiveFixture.coingeckoId },
      create: inactiveFixture,
      update: inactiveFixture,
    });
  });

  afterAll(async () => {
    await prisma.symbol.deleteMany({
      where: { coingeckoId: inactiveFixture.coingeckoId },
    });
    await app.close();
  });

  it('returns an empty envelope when the Symbol exists but has no Candle', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H4' })
      .expect(200);

    expect(res.body).toEqual({
      symbol: 'BTC',
      interval: 'H4',
      items: [],
      stale: false,
    });
  });

  it('returns 404 SYMBOL_NOT_FOUND for an unknown ticker', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'DOGE2', interval: 'H4' })
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      code: 'SYMBOL_NOT_FOUND',
      message: 'Symbol DOGE2 not found',
      path: '/api/v1/candles?symbol=DOGE2&interval=H4',
    });
  });

  it('returns an empty envelope for an inactive Symbol instead of 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'YYY', interval: 'H4' })
      .expect(200);

    expect(res.body).toEqual({
      symbol: 'YYY',
      interval: 'H4',
      items: [],
      stale: false,
    });
  });

  it('rejects missing symbol or interval and a foreign interval with 400', async () => {
    await request(app.getHttpServer()).get('/api/v1/candles').expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ interval: 'H4' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H1' })
      .expect(400);
  });

  it('rejects an extra query field with 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H4', foo: 'bar' })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'BADREQUEST',
      path: '/api/v1/candles?symbol=BTC&interval=H4&foo=bar',
    });
  });

  it('treats lowercase ticker as the same Symbol as BTC', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'btc', interval: 'H4' })
      .expect(200);

    expect(res.body).toEqual({
      symbol: 'BTC',
      interval: 'H4',
      items: [],
      stale: false,
    });
  });

  it('exposes the candles route in OpenAPI 3', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const spec = res.body as {
      openapi: string;
      paths: Record<
        string,
        {
          get?: {
            tags?: string[];
            parameters?: Array<{ name: string }>;
            responses: Record<string, unknown>;
          };
        }
      >;
      components: {
        schemas: {
          CandleHistoryDto?: unknown;
          CandleDto?: unknown;
          ErrorResponseDto?: unknown;
        };
      };
    };
    const candlesGet = spec.paths['/api/v1/candles']?.get;

    expect(spec.openapi).toMatch(/^3\./);
    expect(candlesGet).toBeDefined();
    expect(candlesGet?.tags).toContain('candles');
    expect(candlesGet?.responses['200']).toBeDefined();
    expect(candlesGet?.responses['400']).toBeDefined();
    expect(candlesGet?.responses['404']).toBeDefined();
    expect(candlesGet?.parameters?.map((param) => param.name).sort()).toEqual([
      'interval',
      'symbol',
    ]);
    expect(spec.components.schemas.CandleHistoryDto).toBeDefined();
    expect(spec.components.schemas.CandleDto).toBeDefined();
    expect(spec.components.schemas.ErrorResponseDto).toBeDefined();
  });
});
