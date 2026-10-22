/**
 * E2E тикета 04: один тик Candle Sync глазами HTTP-клиента.
 *
 * Поднимается настоящий AppModule и живой Postgres. CoinGecko снаружи
 * закрыт: ответы подставляет nock. В живую биржу тест не ходит.
 *
 * Таймер в NODE_ENV=test не стартует. Тест сам вызывает sync.tick().
 * Фикстуры — свои символы ZSYNC (активный) и ZOFF (выключенный).
 * Seed BTC/ETH/... не удаляем. Их lastSyncedAt после теста возвращаем назад.
 * Свечи теста лежат на 2030-01-01, чтобы не пересечься с барами других e2e.
 *
 * jest-e2e.json держит maxWorkers: 1. Тик пишет свечи всем активным,
 * включая BTC. Если файлы тестов побегут параллельно, тест истории BTC
 * увидит чужой бар и упадёт.
 */
import { INestApplication } from '@nestjs/common';
import { CandleInterval } from '@prisma/client';
import { Test } from '@nestjs/testing';
import nock from 'nock';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CandleSyncScheduler } from '../src/modules/candles/candle-sync.scheduler';
import { PrismaService } from '../src/prisma/prisma.service';

const SOURCE_ORIGIN = 'https://api.coingecko.com';
const OPEN_TIME = new Date('2030-01-01T00:00:00.000Z');
const DAYS = [1, 30, 365] as const;
const INTERVALS = [CandleInterval.M30, CandleInterval.H4, CandleInterval.D4];

describe('Candle Sync (HTTP e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sync: CandleSyncScheduler;
  let activeId: number;
  let inactiveId: number;
  let originals: Array<{ id: number; lastSyncedAt: Date | null }>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.COINGECKO_BASE_URL = `${SOURCE_ORIGIN}/api/v3`;
    // Кэш на 1 мс: второй тик не получит цены первого и увидит новый close.
    process.env.COINGECKO_CACHE_TTL_MS = '1';
    process.env.COINGECKO_RATE_LIMIT_PER_MIN = '1000';
    // Любой забытый запрос в интернет уронит тест. Базе оставляем localhost.
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    sync = app.get(CandleSyncScheduler);
    const active = await prisma.symbol.upsert({
      where: { coingeckoId: 'e2e-candle-sync-active' },
      create: {
        coingeckoId: 'e2e-candle-sync-active',
        ticker: 'ZSYNC',
        name: 'Sync fixture',
        isActive: true,
      },
      update: { isActive: true, lastSyncedAt: null },
    });
    const inactive = await prisma.symbol.upsert({
      where: { coingeckoId: 'e2e-candle-sync-inactive' },
      create: {
        coingeckoId: 'e2e-candle-sync-inactive',
        ticker: 'ZOFF',
        name: 'Inactive sync fixture',
        isActive: false,
      },
      update: { isActive: false, lastSyncedAt: null },
    });
    activeId = active.id;
    inactiveId = inactive.id;
    originals = await prisma.symbol.findMany({
      where: { isActive: true, id: { not: activeId } },
      select: { id: true, lastSyncedAt: true },
    });
  });

  afterEach(async () => {
    nock.cleanAll();
    if (!prisma) return;
    await prisma.candle.deleteMany({
      where: {
        openTime: OPEN_TIME,
        symbolId: { in: [activeId, ...originals.map((s) => s.id)] },
      },
    });
    await prisma.symbol.update({
      where: { id: activeId },
      data: { lastSyncedAt: null },
    });
    for (const symbol of originals) {
      await prisma.symbol.update({
        where: { id: symbol.id },
        data: { lastSyncedAt: symbol.lastSyncedAt },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.symbol.deleteMany({
        where: { id: { in: [activeId, inactiveId] } },
      });
    }
    if (app) await app.close();
    nock.enableNetConnect();
  });

  // Поддельный OHLC на каждого активного символа и days 1/30/365.
  // failingId на days=365 отвечает 404: timestamp тогда не должен сдвинуться.
  async function expectSourceWave(
    close: number,
    failingId?: string,
  ): Promise<nock.Scope[]> {
    const active = await prisma.symbol.findMany({ where: { isActive: true } });
    const scopes: nock.Scope[] = [];
    for (const symbol of active) {
      for (const days of DAYS) {
        const fails = symbol.coingeckoId === failingId && days === 365;
        scopes.push(
          nock(SOURCE_ORIGIN)
            .get(`/api/v3/coins/${symbol.coingeckoId}/ohlc`)
            .query({ vs_currency: symbol.vsCurrency, days: String(days) })
            .reply(
              fails ? 404 : 200,
              fails ? {} : [[OPEN_TIME.getTime(), 10, 12, 9, close]],
            ),
        );
      }
    }
    return scopes;
  }

  it('syncs every active interval, updates latest on a second tick, and leaves inactive symbols alone', async () => {
    let inactiveRequests = 0;
    // Если планировщик всё же спросит ZOFF, счётчик вырастет и тест упадёт.
    nock(SOURCE_ORIGIN)
      .persist()
      .get(/\/api\/v3\/coins\/e2e-candle-sync-inactive\/ohlc/)
      .reply(() => {
        inactiveRequests += 1;
        return [500, {}];
      });
    const firstWave = await expectSourceWave(11);
    await sync.tick();
    expect(firstWave.every((scope) => scope.isDone())).toBe(true);
    expect(inactiveRequests).toBe(0);

    for (const interval of INTERVALS) {
      const history = await request(app.getHttpServer())
        .get('/api/v1/candles')
        .query({ symbol: 'ZSYNC', interval })
        .expect(200);
      expect((history.body as { items: unknown[] }).items).toContainEqual({
        openTime: OPEN_TIME.toISOString(),
        open: '10.00000000',
        high: '12.00000000',
        low: '9.00000000',
        close: '11.00000000',
        volume: null,
      });
    }
    expect(
      (await prisma.symbol.findUniqueOrThrow({ where: { id: activeId } }))
        .lastSyncedAt,
    ).not.toBeNull();
    expect(await prisma.candle.count({ where: { symbolId: inactiveId } })).toBe(
      0,
    );

    const secondWave = await expectSourceWave(12);
    await sync.tick();
    expect(secondWave.every((scope) => scope.isDone())).toBe(true);
    const latest = await request(app.getHttpServer())
      .get('/api/v1/candles/latest')
      .query({ symbol: 'ZSYNC', interval: 'M30' })
      .expect(200);
    expect((latest.body as { close: string }).close).toBe('12.00000000');
    expect(
      await prisma.candle.count({
        where: { symbolId: activeId, openTime: OPEN_TIME },
      }),
    ).toBe(3);
    expect(inactiveRequests).toBe(0);
  });

  it('does not advance lastSyncedAt when one interval returns 404', async () => {
    const wave = await expectSourceWave(11, 'e2e-candle-sync-active');
    await sync.tick();
    expect(wave.every((scope) => scope.isDone())).toBe(true);
    expect(
      (await prisma.symbol.findUniqueOrThrow({ where: { id: activeId } }))
        .lastSyncedAt,
    ).toBeNull();
    expect(
      await prisma.candle.count({
        where: { symbolId: activeId, openTime: OPEN_TIME },
      }),
    ).toBe(0);
  });

  it('skips an overlapping tick without a second Source wave', async () => {
    const active = await prisma.symbol.findMany({ where: { isActive: true } });
    let sourceRequests = 0;
    for (const symbol of active) {
      for (const days of DAYS) {
        const interceptor = nock(SOURCE_ORIGIN)
          .persist()
          .get(`/api/v3/coins/${symbol.coingeckoId}/ohlc`)
          .query({ vs_currency: symbol.vsCurrency, days: String(days) });
        // Задержка держит первый тик живым, пока тест вызывает второй.
        if (symbol.id === active[0].id && days === 1) interceptor.delay(100);
        interceptor.reply(() => {
          sourceRequests += 1;
          return [200, [[OPEN_TIME.getTime(), 10, 12, 9, 11]]];
        });
      }
    }

    const first = sync.tick();
    await Promise.resolve();
    const overlapping = sync.tick();
    await Promise.all([first, overlapping]);
    expect(sourceRequests).toBe(active.length * DAYS.length);
  });
});
