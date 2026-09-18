/**
 * Проверки переводчика свечей. Живой CoinGecko здесь не вызываем.
 *
 * Смотрим только Adapter: сколько ушло HTTP (nock), какие свечи или ошибки
 * вернулись. Cache и Client не тестируем отдельно — их поведение видно отсюда.
 *
 * Импорты с `.js` — так хочет TypeScript (nodenext). Jest сам находит `.ts`.
 */
import { CandleInterval } from '@prisma/client';
import nock from 'nock';
import { CoinGeckoAdapter } from './coingecko.adapter.js';
import { CoinGeckoCache } from './coingecko.cache.js';
import { CoinGeckoClient } from './coingecko.client.js';
import type { CoinGeckoSettings } from './coingecko.settings.js';
import { SourceCircuitBreaker } from './source-circuit-breaker.js';
import {
  SourceHttpError,
  SourcePayloadError,
  SourceUnavailableError,
} from './source.errors.js';

const SOURCE_ORIGIN = 'https://api.coingecko.com';
// Одна «правильная» свеча Source. Числа целые, чтобы не спорить с float.
const OHLC_TS = 1_704_067_200_000;
const VALID_ROW = [OHLC_TS, 42000, 43000, 41000, 42500] as const;
const VALID_BODY = [VALID_ROW];

/** Чего ждём от адаптера для days=1: 30-минутная свеча, volume пустой. */

const MAPPED_M30 = {
  interval: CandleInterval.M30,
  openTime: new Date(OHLC_TS),
  open: '42000',
  high: '43000',
  low: '41000',
  close: '42500',
  volume: null,
};

/** Настройки как на проде, только ключ тестовый. Можно подменить лимит или TTL. */
function settings(
  overrides: Partial<CoinGeckoSettings> = {},
): CoinGeckoSettings {
  return {
    baseUrl: `${SOURCE_ORIGIN}/api/v3`,
    apiKey: 'test-demo-key',
    rateLimitPerMin: 50,
    cacheTtlMs: 60_000,
    timeoutMs: 8_000,
    ...overrides,
  };
}

function createAdapter(
  overrides: Partial<CoinGeckoSettings> = {},
): CoinGeckoAdapter {
  // Настоящие кэш, клиент и предохранитель. Подделываем только сеть (nock).
  const cfg = settings(overrides);
  return new CoinGeckoAdapter(
    new CoinGeckoCache(cfg),
    new CoinGeckoClient(cfg),
    new SourceCircuitBreaker(),
  );
}

function ohlcPath(coingeckoId: string): string {
  return `/api/v3/coins/${coingeckoId}/ohlc`;
}

/** Подставить ответ CoinGecko на GET .../ohlc без выхода в интернет. */

function interceptOhlc(
  coingeckoId: string,
  days: number,
  body: unknown,
  status = 200,
): nock.Scope {
  return nock(SOURCE_ORIGIN)
    .get(ohlcPath(coingeckoId))
    .query({ vs_currency: 'usd', days: String(days) })
    .reply(status, body as nock.Body);
}

describe('CoinGeckoAdapter', () => {
  beforeAll(() => {
    nock.disableNetConnect(); // любой другой URL = ошибка теста, не живая биржа
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  it('maps OHLC row to Candle with volume null and M30 for days=1', async () => {
    interceptOhlc('bitcoin', 1, VALID_BODY);
    const adapter = createAdapter();

    await expect(
      adapter.getOhlc({
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).resolves.toEqual([MAPPED_M30]);
  });

  it.each([
    [1, CandleInterval.M30],
    [7, CandleInterval.H4],
    [30, CandleInterval.H4],
    [365, CandleInterval.D4],
  ] as const)('maps days=%s to %s', async (days, interval) => {
    interceptOhlc('bitcoin', days, VALID_BODY);
    const adapter = createAdapter();

    const [candle] = await adapter.getOhlc({
      coingeckoId: 'bitcoin',
      vsCurrency: 'usd',
      days,
    });

    expect(candle.interval).toBe(interval);
    expect(candle.volume).toBeNull();
  });

  it('rejects the whole payload when one row is broken', async () => {
    interceptOhlc('bitcoin', 1, [VALID_ROW, [OHLC_TS, 1, 2]]);
    const adapter = createAdapter();

    await expect(
      adapter.getOhlc({
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).rejects.toBeInstanceOf(SourcePayloadError);
  });

  it('sends the Demo API key header', async () => {
    nock(SOURCE_ORIGIN, {
      reqheaders: { 'x-cg-demo-api-key': 'test-demo-key' },
    })
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(200, VALID_BODY);

    await expect(
      createAdapter().getOhlc({
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).resolves.toHaveLength(1);
  });

  it('omits the Demo API key header when the key is empty', async () => {
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(function () {
        expect(this.req.headers['x-cg-demo-api-key']).toBeUndefined();
        return [200, VALID_BODY];
      });

    await expect(
      createAdapter({ apiKey: '' }).getOhlc({
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).resolves.toHaveLength(1);
  });

  it('retries 5xx then returns Candle', async () => {
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(500, { error: 'unavailable' })
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(200, VALID_BODY);

    await expect(
      createAdapter().getOhlc({
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).resolves.toEqual([MAPPED_M30]);
  });

  it('does not retry 4xx other than 429', async () => {
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(400, { error: 'bad request' });

    await expect(
      createAdapter().getOhlc({
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('waits Retry-After on 429 without spending a retry', async () => {
    // Сначала «подожди 0 сек», потом три 429 и успех. Если бы пауза тратила повтор — до 200 бы не дошли.
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(429, { error: 'rate limited' }, { 'Retry-After': '0' })
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .times(3)
      .reply(429, { error: 'rate limited' })
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(200, VALID_BODY);

    await expect(
      createAdapter().getOhlc({
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        days: 1,
      }),
    ).resolves.toEqual([MAPPED_M30]);
  });

  it('shares one HTTP request across 10 parallel calls of the same key', async () => {
    let hits = 0;
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(200, () => {
        hits += 1;
        return VALID_BODY;
      });

    const adapter = createAdapter();
    const query = {
      coingeckoId: 'bitcoin',
      vsCurrency: 'usd',
      days: 1 as const,
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => adapter.getOhlc(query)),
    );

    expect(hits).toBe(1);
    expect(results).toHaveLength(10);
    expect(results[0]).toEqual([MAPPED_M30]);
  });

  it('reuses cache within TTL and refetches after expiry with single-flight', async () => {
    let now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    let hits = 0;
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .times(2)
      .reply(200, () => {
        hits += 1;
        return VALID_BODY;
      });

    const adapter = createAdapter();
    const query = {
      coingeckoId: 'bitcoin',
      vsCurrency: 'usd',
      days: 1 as const,
    };

    await adapter.getOhlc(query);
    now += 30_000;
    await adapter.getOhlc(query);
    expect(hits).toBe(1);

    now += 31_000;
    const afterExpiry = await Promise.all(
      Array.from({ length: 10 }, () => adapter.getOhlc(query)),
    );
    expect(hits).toBe(2);
    expect(afterExpiry[0]).toEqual([MAPPED_M30]);
  });

  it('opens the breaker after 5 payload errors and then skips HTTP', async () => {
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .times(5)
      .reply(200, { error: 'not an array' });

    const adapter = createAdapter();
    const query = {
      coingeckoId: 'bitcoin',
      vsCurrency: 'usd',
      days: 1 as const,
    };

    for (let i = 0; i < 5; i += 1) {
      await expect(adapter.getOhlc(query)).rejects.toBeInstanceOf(
        SourcePayloadError,
      );
    }
    expect(adapter.isCircuitOpen()).toBe(true);

    await expect(adapter.getOhlc(query)).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('does not open the breaker on 404', async () => {
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('missing-coin'))
      .query({ vs_currency: 'usd', days: '1' })
      .times(10)
      .reply(404, { error: 'not found' });

    const adapter = createAdapter();
    const query = {
      coingeckoId: 'missing-coin',
      vsCurrency: 'usd',
      days: 1 as const,
    };

    for (let i = 0; i < 10; i += 1) {
      await expect(adapter.getOhlc(query)).rejects.toBeInstanceOf(
        SourceHttpError,
      );
    }
    expect(adapter.isCircuitOpen()).toBe(false);
  });

  it('allows a single probe in half-open after 60s', async () => {
    // bitcoin и ethereum — разные ключи кэша, иначе «один HTTP» дал бы кэш, не предохранитель.
    let now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .times(5)
      .reply(200, { error: 'not an array' });

    const adapter = createAdapter();
    const bitcoin = {
      coingeckoId: 'bitcoin',
      vsCurrency: 'usd',
      days: 1 as const,
    };
    for (let i = 0; i < 5; i += 1) {
      await expect(adapter.getOhlc(bitcoin)).rejects.toBeInstanceOf(
        SourcePayloadError,
      );
    }

    now += 60_000;
    let hits = 0;
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('bitcoin'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(200, () => {
        hits += 1;
        return VALID_BODY;
      });
    nock(SOURCE_ORIGIN)
      .get(ohlcPath('ethereum'))
      .query({ vs_currency: 'usd', days: '1' })
      .reply(200, () => {
        hits += 1;
        return VALID_BODY;
      });

    const outcomes = await Promise.allSettled([
      adapter.getOhlc(bitcoin),
      adapter.getOhlc({
        coingeckoId: 'ethereum',
        vsCurrency: 'usd',
        days: 1,
      }),
    ]);

    expect(hits).toBe(1);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      outcomes.filter(
        (item) =>
          item.status === 'rejected' &&
          item.reason instanceof SourceUnavailableError,
      ),
    ).toHaveLength(1);
  });

  it('waits when the token bucket is empty instead of rejecting', async () => {
    // 50 жетонов в минуту, 51 разная монета: последний должен подождать, не упасть.
    nock(SOURCE_ORIGIN)
      .get(/\/api\/v3\/coins\/coin-\d+\/ohlc/)
      .query(true)
      .times(51)
      .reply(200, VALID_BODY);

    const adapter = createAdapter();
    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 51 }, (_, index) =>
        adapter.getOhlc({
          coingeckoId: `coin-${index}`,
          vsCurrency: 'usd',
          days: 1,
        }),
      ),
    );

    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    expect(results).toHaveLength(51);
    expect(results.every((items) => items.length === 1)).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});
