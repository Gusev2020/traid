/**
 * E2E слоя B2 — GET /api/v1/symbols/:ticker на локальный Postgres.
 *
 * Отличие от bootstrap-теста B1:
 *   - PrismaService НЕ мокаем: бьём в реальную БД dev-окружения
 *   - seed-символы (BTC, ETH, …) не truncate; фикстуру ZZZ удаляем только её
 *
 * Покрывает внешнее поведение шва HTTP: 200 карточки, регистр ticker,
 * 404 SYMBOL_NOT_FOUND, inactive → 200, OpenAPI 3 на /docs-json.
 *
 * Запуск: npm run test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('GET /api/v1/symbols/:ticker (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Не из seed: вставляем в beforeAll, снимаем в afterAll. BTC не трогаем.
  const inactiveFixture = {
    ticker: 'ZZZ',
    name: 'E2E Inactive',
    coingeckoId: 'e2e-inactive-symbol',
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
    configureApp(app); // те же глобальные настройки, что в main.ts
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

  it('returns the seed BTC card', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/symbols/BTC')
      .expect(200);

    expect(res.body).toEqual({
      ticker: 'BTC',
      name: 'Bitcoin',
      coingeckoId: 'bitcoin',
      vsCurrency: 'usd',
      isActive: true,
      lastSyncedAt: null,
    });
  });

  it('treats lowercase ticker as the same Symbol as BTC', async () => {
    const [upper, lower] = await Promise.all([
      request(app.getHttpServer()).get('/api/v1/symbols/BTC').expect(200),
      request(app.getHttpServer()).get('/api/v1/symbols/btc').expect(200),
    ]);

    expect(lower.body).toEqual(upper.body);
  });

  it('returns 404 SYMBOL_NOT_FOUND for an unknown ticker', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/symbols/DOGE2')
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      code: 'SYMBOL_NOT_FOUND',
      message: 'Symbol DOGE2 not found',
      path: '/api/v1/symbols/DOGE2',
    });
  });

  it('returns an inactive Symbol by ticker instead of 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/symbols/ZZZ')
      .expect(200);

    expect(res.body).toEqual({
      ticker: 'ZZZ',
      name: 'E2E Inactive',
      coingeckoId: 'e2e-inactive-symbol',
      vsCurrency: 'usd',
      isActive: false,
      lastSyncedAt: null,
    });
  });

  it('exposes OpenAPI 3 at /docs-json with the ticker route and example', async () => {
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
            responses: Record<
              string,
              { content?: { 'application/json'?: { schema?: unknown } } }
            >;
          };
        }
      >;
      components: {
        schemas: {
          SymbolDto: { properties: { ticker: { example: string } } };
          ErrorResponseDto: unknown;
        };
      };
    };

    expect(spec.openapi).toMatch(/^3\./);
    const pathItem = spec.paths['/api/v1/symbols/{ticker}'];
    expect(pathItem.get).toBeDefined();
    expect(pathItem.get?.tags).toContain('symbols');
    expect(
      pathItem.get?.responses['200'].content?.['application/json']?.schema,
    ).toBeDefined();
    expect(spec.components.schemas.SymbolDto.properties.ticker.example).toBe(
      'BTC',
    );
    expect(spec.components.schemas.ErrorResponseDto).toBeDefined();
  });
});
