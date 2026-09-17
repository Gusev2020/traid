/**
 * E2E слоя B2 — HTTP-шов тикетов 03–05 на локальный Postgres.
 *
 * Поднимает AppModule + configureApp (тот же pipe/Swagger, что prod).
 * Цепочка та же, что в коде: Query DTO → Controller → Service → Repository → Prisma.
 * Карта файлов — src/modules/candles/candles.module.ts.
 *
 * PrismaService НЕ мокаем: бьём в реальную БД dev-окружения.
 * Seed-символы (BTC, …) не truncate; свечи в seed нет — BTC+H4 без фикстур даёт items: [].
 * Фикстуру неактивного Symbol (YYY) удаляем только её.
 * Фикстуры Candle вставляются в тесте и в afterEach удаляются только они.
 *
 * Тикет 03: 200 пустой конверт, регистр ticker, 404 SYMBOL_NOT_FOUND, inactive → 200,
 *           400 whitelist / interval / пустые поля, query-поля в OpenAPI.
 * Тикет 04: inclusive from/to, хвост limit ASC, from>to → 400, limit 1..1000,
 *           цены string, Volume string|null.
 * Тикет 05: GET /candles/latest — 200 Latest Candle, 404 CANDLE_NOT_FOUND /
 *           SYMBOL_NOT_FOUND, 400, inactive с историей, все четыре GET в OpenAPI.
 *
 * Запуск: npm run test:e2e -- candles.e2e-spec.ts
 */
import { INestApplication } from '@nestjs/common';
import { CandleInterval } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Те же четыре openTime, что в unit. afterEach удаляет только их, seed BTC не трогаем.
const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T04:00:00.000Z';
const T2 = '2026-01-01T08:00:00.000Z';
const T3 = '2026-01-01T12:00:00.000Z';

const fixtureOpenTimes = [T0, T1, T2, T3].map((time) => new Date(time));

describe('GET /api/v1/candles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let btcSymbolId: number;
  let yyySymbolId: number;

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
    const yyy = await prisma.symbol.upsert({
      where: { coingeckoId: inactiveFixture.coingeckoId },
      create: inactiveFixture,
      update: inactiveFixture,
    });
    yyySymbolId = yyy.id;
    const btc = await prisma.symbol.findFirst({
      where: { ticker: 'BTC', vsCurrency: 'usd' },
    });
    if (btc === null) {
      throw new Error('seed Symbol BTC is required for candles e2e');
    }
    btcSymbolId = btc.id;
  });

  /** Тестовые H4-бары BTC и YYY. Чужие Candle и seed Symbol не трогаем. */
  async function deleteFixtureCandles(): Promise<void> {
    await prisma.candle.deleteMany({
      where: {
        symbolId: { in: [btcSymbolId, yyySymbolId] },
        interval: CandleInterval.H4,
        openTime: { in: fixtureOpenTimes },
      },
    });
  }

  afterEach(async () => {
    await deleteFixtureCandles();
  });

  afterAll(async () => {
    await prisma.symbol.deleteMany({
      where: { coingeckoId: inactiveFixture.coingeckoId },
    });
    await app.close();
  });

  /** Четыре бара на seed BTC+H4. T1.volume = null — ключ в JSON есть, это не ноль. */
  async function insertRangeFixtures(): Promise<void> {
    await deleteFixtureCandles();
    await prisma.candle.createMany({
      data: [
        {
          symbolId: btcSymbolId,
          interval: CandleInterval.H4,
          openTime: new Date(T0),
          open: '100.00000000',
          high: '110.00000000',
          low: '90.00000000',
          close: '105.00000000',
          volume: '1.00000000',
        },
        {
          symbolId: btcSymbolId,
          interval: CandleInterval.H4,
          openTime: new Date(T1),
          open: '200.00000000',
          high: '210.00000000',
          low: '190.00000000',
          close: '205.00000000',
          volume: null,
        },
        {
          symbolId: btcSymbolId,
          interval: CandleInterval.H4,
          openTime: new Date(T2),
          open: '300.00000000',
          high: '310.00000000',
          low: '290.00000000',
          close: '305.00000000',
          volume: '3.00000000',
        },
        {
          symbolId: btcSymbolId,
          interval: CandleInterval.H4,
          openTime: new Date(T3),
          open: '400.00000000',
          high: '410.00000000',
          low: '390.00000000',
          close: '405.00000000',
          volume: '4.00000000',
        },
      ],
    });
  }

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

  it('includes candles on from and to bounds with string prices and null Volume', async () => {
    await insertRangeFixtures();

    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({
        symbol: 'BTC',
        interval: 'H4',
        from: T1,
        to: T2,
      })
      .expect(200);

    expect(res.body).toEqual({
      symbol: 'BTC',
      interval: 'H4',
      stale: false,
      items: [
        {
          openTime: T1,
          open: '200.00000000',
          high: '210.00000000',
          low: '190.00000000',
          close: '205.00000000',
          volume: null,
        },
        {
          openTime: T2,
          open: '300.00000000',
          high: '310.00000000',
          low: '290.00000000',
          close: '305.00000000',
          volume: '3.00000000',
        },
      ],
    });
  });

  it('returns the last limit candles in openTime ASC when from and to are omitted', async () => {
    await insertRangeFixtures();

    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H4', limit: 2 })
      .expect(200);

    expect(res.body).toEqual({
      symbol: 'BTC',
      interval: 'H4',
      stale: false,
      items: [
        {
          openTime: T2,
          open: '300.00000000',
          high: '310.00000000',
          low: '290.00000000',
          close: '305.00000000',
          volume: '3.00000000',
        },
        {
          openTime: T3,
          open: '400.00000000',
          high: '410.00000000',
          low: '390.00000000',
          close: '405.00000000',
          volume: '4.00000000',
        },
      ],
    });
  });

  it('returns 400 when from is after to', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({
        symbol: 'BTC',
        interval: 'H4',
        from: T2,
        to: T1,
      })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'INVALID_CANDLE_RANGE',
    });
  });

  it('rejects limit below 1 or above 1000 with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H4', limit: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H4', limit: 1001 })
      .expect(400);
  });

  it('rejects a non-ISO from with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H4', from: 'yesterday' })
      .expect(400);
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
      'from',
      'interval',
      'limit',
      'symbol',
      'to',
    ]);
    expect(spec.components.schemas.CandleHistoryDto).toBeDefined();
    expect(spec.components.schemas.CandleDto).toBeDefined();
    expect(spec.components.schemas.ErrorResponseDto).toBeDefined();
  });

  describe('GET /api/v1/candles/latest', () => {
    // T3 — наибольший openTime фикстур; symbol=btc проверяет toUpperCase на новом DTO.
    it('returns the Latest Candle (greatest openTime) for the Symbol and CandleInterval', async () => {
      await insertRangeFixtures();

      const res = await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ symbol: 'btc', interval: 'H4' })
        .expect(200);

      expect(res.body).toEqual({
        openTime: T3,
        open: '400.00000000',
        high: '410.00000000',
        low: '390.00000000',
        close: '405.00000000',
        volume: '4.00000000',
      });
    });

    // Seed BTC без свечей: не пустой 200, как GET /candles, а 404 CANDLE_NOT_FOUND.
    it('returns 404 CANDLE_NOT_FOUND when the Symbol exists but has no Candle', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ symbol: 'BTC', interval: 'H4' })
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        code: 'CANDLE_NOT_FOUND',
        message: 'Latest Candle not found',
        path: '/api/v1/candles/latest?symbol=BTC&interval=H4',
      });
    });

    it('returns 404 SYMBOL_NOT_FOUND for an unknown ticker', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ symbol: 'DOGE2', interval: 'H4' })
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        code: 'SYMBOL_NOT_FOUND',
        message: 'Symbol DOGE2 not found',
        path: '/api/v1/candles/latest?symbol=DOGE2&interval=H4',
      });
    });

    it('rejects missing symbol or interval and extra query fields with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ interval: 'H4' })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ symbol: 'BTC' })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ symbol: 'BTC', interval: 'H1' })
        .expect(400);

      const extra = await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ symbol: 'BTC', interval: 'H4', foo: 'bar' })
        .expect(400);

      expect(extra.body).toMatchObject({
        statusCode: 400,
        code: 'BADREQUEST',
        path: '/api/v1/candles/latest?symbol=BTC&interval=H4&foo=bar',
      });
    });

    // YYY неактивен; volume null — ключ в JSON есть, это не ноль.
    it('returns Latest Candle for an inactive Symbol instead of 404', async () => {
      await prisma.candle.create({
        data: {
          symbolId: yyySymbolId,
          interval: CandleInterval.H4,
          openTime: new Date(T3),
          open: '10.00000000',
          high: '11.00000000',
          low: '9.00000000',
          close: '10.50000000',
          volume: null,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/candles/latest')
        .query({ symbol: 'YYY', interval: 'H4' })
        .expect(200);

      expect(res.body).toEqual({
        openTime: T3,
        open: '10.00000000',
        high: '11.00000000',
        low: '9.00000000',
        close: '10.50000000',
        volume: null,
      });
    });

    // Тикет 05 закрывает слой: в спеке все четыре GET B2, latest — только symbol+interval.
    it('exposes all four B2 GET routes in OpenAPI 3', async () => {
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
      };
      const latestGet = spec.paths['/api/v1/candles/latest']?.get;

      expect(spec.openapi).toMatch(/^3\./);
      expect(spec.paths['/api/v1/symbols']?.get).toBeDefined();
      expect(spec.paths['/api/v1/symbols/{ticker}']?.get).toBeDefined();
      expect(spec.paths['/api/v1/candles']?.get).toBeDefined();
      expect(latestGet).toBeDefined();
      expect(latestGet?.tags).toContain('candles');
      expect(latestGet?.responses['200']).toBeDefined();
      expect(latestGet?.responses['400']).toBeDefined();
      expect(latestGet?.responses['404']).toBeDefined();
      expect(latestGet?.parameters?.map((param) => param.name).sort()).toEqual([
        'interval',
        'symbol',
      ]);
    });
  });
});
