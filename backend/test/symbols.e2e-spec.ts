/**
 * E2E слоя B2 — HTTP-шов тикетов 01 (карточка) и 02 (список) на локальный Postgres.
 *
 * Поднимает AppModule + configureApp (тот же pipe/Swagger, что prod).
 * Цепочка та же, что в коде: Query DTO → Controller → Service → Repository → Prisma.
 *
 * Отличие от bootstrap-теста B1:
 *   - PrismaService НЕ мокаем: бьём в реальную БД dev-окружения
 *   - seed-символы (BTC, ETH, …) не truncate; фикстуру ZZZ удаляем только её
 *
 * Тикет 01: 200 карточки, регистр ticker, 404 SYMBOL_NOT_FOUND, inactive → 200.
 * Тикет 02: Active по умолчанию, search, active=false, limit/offset + total,
 *           400 whitelist / невалидный limit, query-поля в OpenAPI.
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

type SymbolListBody = {
  items: Array<{ ticker: string; isActive: boolean }>;
  total: number;
};

/** Supertest body — any; сужаем до контракта { items, total }, не лезем в Prisma. */
function asList(res: { body: unknown }): SymbolListBody {
  return res.body as SymbolListBody;
}

describe('GET /api/v1/symbols (e2e)', () => {
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

  // --- тикет 02: GET /symbols, тот же app и фикстура ZZZ, seed не truncate ---

  it('returns only Active Symbol with default limit and total', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .expect(200);

    const body = asList(res);
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.items.length).toBeLessThanOrEqual(50);
    expect(body.items.length).toBeLessThanOrEqual(body.total);
    expect(body.items.every((item) => item.isActive)).toBe(true);
    expect(body.items.some((item) => item.ticker === 'BTC')).toBe(true);
    expect(body.items.some((item) => item.ticker === 'ZZZ')).toBe(false);
  });

  it('searches ticker or name without regard to case', async () => {
    const [byTicker, byName] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/symbols')
        .query({ search: 'eth' })
        .expect(200),
      request(app.getHttpServer())
        .get('/api/v1/symbols')
        .query({ search: 'ETHEREUM' })
        .expect(200),
    ]);

    const tickerHits = asList(byTicker);
    const nameHits = asList(byName);
    expect(tickerHits.items.some((item) => item.ticker === 'ETH')).toBe(true);
    expect(tickerHits.items.some((item) => item.ticker === 'BTC')).toBe(false);
    expect(nameHits.items).toEqual(tickerHits.items);
  });

  it('returns only inactive Symbol when active=false', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ active: 'false' })
      .expect(200);

    const body = asList(res);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item) => item.isActive === false)).toBe(true);
    expect(body.items.some((item) => item.ticker === 'ZZZ')).toBe(true);
    expect(body.items.some((item) => item.ticker === 'BTC')).toBe(false);
  });

  it('pages with limit/offset and keeps total as the filtered count', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ limit: 2, offset: 0 })
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ limit: 2, offset: 2 })
      .expect(200);

    const firstPage = asList(first);
    const secondPage = asList(second);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBeGreaterThan(2);
    expect(firstPage.total).toBe(secondPage.total);
    expect(firstPage.items.length).not.toBe(firstPage.total);
    expect(firstPage.items.map((item) => item.ticker)).not.toEqual(
      secondPage.items.map((item) => item.ticker),
    );
  });

  it('rejects an extra query field with 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ foo: 'bar' })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'BADREQUEST',
      path: '/api/v1/symbols?foo=bar',
    });
  });

  it('rejects invalid limit and offset with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ limit: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ limit: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ offset: -1 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/symbols')
      .query({ limit: 'abc' })
      .expect(400);
  });

  it('exposes the list route in OpenAPI 3', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const spec = res.body as {
      paths: Record<
        string,
        { get?: { tags?: string[]; parameters?: Array<{ name: string }> } }
      >;
      components: { schemas: { SymbolListDto?: unknown } };
    };
    const listGet = spec.paths['/api/v1/symbols']?.get;

    expect(listGet).toBeDefined();
    expect(listGet?.tags).toContain('symbols');
    expect(spec.components.schemas.SymbolListDto).toBeDefined();
    expect(listGet?.parameters?.map((param) => param.name).sort()).toEqual([
      'active',
      'limit',
      'offset',
      'search',
    ]);
  });
});
