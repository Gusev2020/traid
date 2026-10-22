/**
 * E2E тикета 03: бейдж stale и строка CoinGecko в /health.
 *
 * График по-прежнему читает только Postgres. Чтобы проверить «биржа лежит»,
 * тест сам дёргает адаптер через nock и открывает предохранитель.
 * Планировщик здесь не нужен.
 *
 * Свой символ ZSTALE и время 2031-06-01 — seed BTC не трогаем.
 * Ловушка armSourceTrap считает запросы к CoinGecko во время GET.
 * Если история или latest сами пойдут в Source, счётчик будет не ноль.
 */
import { INestApplication } from '@nestjs/common';
import { CandleInterval } from '@prisma/client';
import { Test } from '@nestjs/testing';
import nock from 'nock';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CoinGeckoAdapter } from '../src/integrations/coingecko/coingecko.adapter';
import { PrismaService } from '../src/prisma/prisma.service';

const SOURCE_ORIGIN = 'https://api.coingecko.com';
const OPEN_TIME = '2031-06-01T00:00:00.000Z';

describe('Source stale and health (HTTP e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let source: CoinGeckoAdapter;
  let symbolId: number;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.COINGECKO_BASE_URL = `${SOURCE_ORIGIN}/api/v3`;
    process.env.COINGECKO_CACHE_TTL_MS = '1';
    process.env.COINGECKO_RATE_LIMIT_PER_MIN = '1000';
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    source = app.get(CoinGeckoAdapter);
    const symbol = await prisma.symbol.upsert({
      where: { coingeckoId: 'e2e-stale-symbol' },
      create: {
        coingeckoId: 'e2e-stale-symbol',
        ticker: 'ZSTALE',
        name: 'Stale fixture',
        isActive: true,
      },
      update: { isActive: true },
    });
    symbolId = symbol.id;
    await prisma.candle.deleteMany({ where: { symbolId } });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.symbol.deleteMany({
        where: { coingeckoId: 'e2e-stale-symbol' },
      });
    }
    if (app) await app.close();
    nock.enableNetConnect();
  });

  // Любой HTTP к CoinGecko во время чтения графика увеличивает hits.
  function armSourceTrap(): { hits: () => number } {
    let hits = 0;
    nock(SOURCE_ORIGIN)
      .persist()
      .get(/.*/)
      .reply(() => {
        hits += 1;
        return [500, {}];
      });
    return { hits: () => hits };
  }

  it('returns an empty history with stale false while the breaker is closed', async () => {
    const trap = armSourceTrap();
    const history = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'ZSTALE', interval: 'H4' })
      .expect(200);

    expect(history.body).toMatchObject({
      symbol: 'ZSTALE',
      interval: 'H4',
      items: [],
      stale: false,
    });
    expect(trap.hits()).toBe(0);

    const health = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(health.body).toMatchObject({
      status: 'ok',
      details: { coingecko: { status: 'up', state: 'up' } },
    });
  });

  it('keeps stale false for stored candles while Source is up, and latest has no stale field', async () => {
    await prisma.candle.create({
      data: {
        symbolId,
        interval: CandleInterval.H4,
        openTime: new Date(OPEN_TIME),
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: null,
      },
    });

    const trap = armSourceTrap();
    const history = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'ZSTALE', interval: 'H4' })
      .expect(200);
    expect(history.body).toMatchObject({
      stale: false,
      items: [
        {
          openTime: OPEN_TIME,
          close: '11.00000000',
          volume: null,
        },
      ],
    });

    const latest = await request(app.getHttpServer())
      .get('/api/v1/candles/latest')
      .query({ symbol: 'ZSTALE', interval: 'H4' })
      .expect(200);
    expect(latest.body).toEqual({
      openTime: OPEN_TIME,
      open: '10.00000000',
      high: '12.00000000',
      low: '9.00000000',
      close: '11.00000000',
      volume: null,
    });
    expect(trap.hits()).toBe(0);
  });

  it('does not open the breaker or mark history stale on a 404 for one id', async () => {
    nock(SOURCE_ORIGIN)
      .get('/api/v3/coins/e2e-stale-missing/ohlc')
      .query({ vs_currency: 'usd', days: '1' })
      .reply(404, {});

    await expect(
      source.getOhlc({
        coingeckoId: 'e2e-stale-missing',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).rejects.toThrow('Source HTTP 404');
    expect(source.isCircuitOpen()).toBe(false);

    const history = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'ZSTALE', interval: 'H4' })
      .expect(200);
    expect(history.body).toMatchObject({ stale: false });
  });

  it('serves stored candles with stale true and keeps /health 200 when the breaker is open', async () => {
    nock(SOURCE_ORIGIN)
      .persist()
      .get('/api/v3/coins/e2e-stale-breaker/ohlc')
      .query({ vs_currency: 'usd', days: '1' })
      .reply(200, { bad: true });

    // Пять битых JSON подряд открывают предохранитель.
    // 404 на одну монету сюда не входит: это не «биржа лежит», а нет такого id.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        source.getOhlc({
          coingeckoId: 'e2e-stale-breaker',
          vsCurrency: 'usd',
          days: 1,
        }),
      ).rejects.toThrow('Source OHLC payload rejected');
    }
    expect(source.isCircuitOpen()).toBe(true);

    nock.cleanAll();
    const trap = armSourceTrap();
    const history = await request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'ZSTALE', interval: 'H4' })
      .expect(200);
    expect(history.body).toMatchObject({
      stale: true,
      items: [
        expect.objectContaining({ openTime: OPEN_TIME, close: '11.00000000' }),
      ],
    });

    const latest = await request(app.getHttpServer())
      .get('/api/v1/candles/latest')
      .query({ symbol: 'ZSTALE', interval: 'H4' })
      .expect(200);
    expect(latest.body).not.toHaveProperty('stale');

    const health = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(health.body).toMatchObject({
      status: 'ok',
      details: { coingecko: { status: 'up', state: 'degraded' } },
    });
    expect(trap.hits()).toBe(0);
  });
});
