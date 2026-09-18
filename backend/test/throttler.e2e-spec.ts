/**
 * E2E слоя B3, тикет 01 — HTTP-шов throttler.
 *
 * Что проверяем снаружи, без внутренности token bucket:
 *   1. Флуд GET /api/v1/candles с одного IP → 429 и заголовок Retry-After
 *   2. Тот же IP сразу после 429 ещё достаёт GET /health → 200 (SkipThrottle)
 *   3. Другой IP за proxy не делит корзину → история 200
 *   4. В OpenAPI истории есть код 429
 *
 * Тот же bootstrap, что B2: AppModule + configureApp (prefix, pipe, trust proxy, Swagger).
 * Живой Postgres, seed BTC. Source ещё нет; GET по-прежнему только из хранилища.
 *
 * THROTTLER_E2E=1 — единственный способ включить лимиты архитектуры в NODE_ENV=test.
 * Без флага AppModule.skipIf выключает guard: иначе short 5 req/s роняет
 * candles.e2e-spec / symbols.e2e-spec на обычной нагрузке сюиты.
 * afterAll снимает флаг, чтобы соседний файл в том же jest-worker не унаследовал его.
 *
 * IP в тестах — TEST-NET-3 (RFC 5737), не «настоящие» клиенты.
 * X-Forwarded-For работает только потому, что configureApp ставит trust proxy.
 * Без него Express игнорирует заголовок, все запросы = 127.0.0.1, второй IP тоже 429.
 *
 * FLOOD_COUNT=12 > short limit 5/1s. Medium 60/мин и long 500/15мин этим прогоном
 * не берём — тикет требует факт 429, не таблицу всех трёх окон.
 *
 * Запуск: npm run test:e2e -- throttler.e2e-spec.ts
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const FLOOD_IP = '203.0.113.10';
const OTHER_IP = '203.0.113.20';
const FLOOD_COUNT = 12;

describe('HTTP throttler (e2e)', () => {
  let app: INestApplication<App>;
  let previousThrottlerE2e: string | undefined;

  beforeAll(async () => {
    previousThrottlerE2e = process.env.THROTTLER_E2E;
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.THROTTLER_E2E = '1';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (previousThrottlerE2e === undefined) {
      delete process.env.THROTTLER_E2E;
    } else {
      process.env.THROTTLER_E2E = previousThrottlerE2e;
    }
    await app.close();
  });

  /** История с подставленным клиентским IP за reverse-proxy. */
  function candlesFrom(ip: string) {
    return request(app.getHttpServer())
      .get('/api/v1/candles')
      .query({ symbol: 'BTC', interval: 'H4' })
      .set('X-Forwarded-For', ip);
  }

  // Тикет: контракт 429 появляется в OpenAPI истории (не latest).
  // Ставим раньше флуда: /docs-json тоже под глобальным guard, другой IP, чем FLOOD_IP.
  it('documents 429 on Candle history in OpenAPI 3', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const spec = res.body as {
      paths: Record<string, { get?: { responses: Record<string, unknown> } }>;
    };

    expect(spec.paths['/api/v1/candles']?.get?.responses['429']).toBeDefined();
  });

  it('returns 429 and Retry-After when one IP floods Candle history', async () => {
    const statuses: number[] = [];
    let retryAfter: string | undefined;

    for (let i = 0; i < FLOOD_COUNT; i += 1) {
      const res = await candlesFrom(FLOOD_IP);
      statuses.push(res.status);
      if (res.status === 429) {
        // Node отдаёт заголовки в lower-case. Канон — Retry-After, не Retry-After-short.
        retryAfter = res.headers['retry-after'];
        break;
      }
    }

    expect(statuses).toContain(429);
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number(retryAfter)).toBeGreaterThan(0);

    // Тот же IP, тот же момент: probe не должен получить 429 вместе с историей.
    const probe = await request(app.getHttpServer())
      .get('/health')
      .set('X-Forwarded-For', FLOOD_IP)
      .expect(200);
    expect(probe.body).toMatchObject({ status: 'ok' });

    // trust proxy: корзина считается по X-Forwarded-For, не по сокету 127.0.0.1.
    const other = await candlesFrom(OTHER_IP).expect(200);
    expect(other.body).toMatchObject({ symbol: 'BTC', interval: 'H4' });
  });

  // Без SkipThrottle у /health свой ключ (класс+метод+IP), 12 пробы тоже упёрлись бы в short.
  it('keeps GET /health at 200 under the same flood', async () => {
    for (let i = 0; i < FLOOD_COUNT; i += 1) {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('X-Forwarded-For', FLOOD_IP)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'ok' });
    }
  });
});
