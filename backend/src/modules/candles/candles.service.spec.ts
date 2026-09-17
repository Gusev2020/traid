/**
 * Unit-шов тикетов 03–04 (spec Testing Decisions, шов 2): правила окна
 * и пустая история → [] (не not-found). Тикет 05 (latest) сюда не входит:
 * lookup без окна, шов — HTTP, test/candles.e2e-spec.ts.
 *
 * Репозиторий замокан, как health-тесты B1 мокают индикаторы.
 * HTTP-коды здесь не проверяем — сервис их не знает.
 * Мок отдаёт полный набор свечей; окно применяет сервис.
 */
import { CandleInterval } from '@prisma/client';
import { CandleRecord } from './candle.record';
import { CandlesRepository } from './candles.repository';
import { CandlesService } from './candles.service';

// Четыре H4-бара: T1/T2 — границы inclusive-окна; T0/T3 — снаружи; хвост limit=2 → T2,T3.
const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T04:00:00.000Z';
const T2 = '2026-01-01T08:00:00.000Z';
const T3 = '2026-01-01T12:00:00.000Z';

function candle(
  openTime: string,
  volume: string | null = '1.00000000',
): CandleRecord {
  return {
    openTime: new Date(openTime),
    open: '100.00000000',
    high: '110.00000000',
    low: '90.00000000',
    close: '105.00000000',
    volume,
  };
}

function serviceWith(items: CandleRecord[]): CandlesService {
  const candles = {
    findSymbolIdByTicker: jest.fn().mockResolvedValue(1),
    findHistory: jest.fn().mockResolvedValue(items),
  };
  return new CandlesService(candles as unknown as CandlesRepository);
}

describe('CandlesService', () => {
  it('returns empty items when the Symbol exists but has no Candle', async () => {
    const service = serviceWith([]);

    await expect(
      service.getHistory({ symbol: 'BTC', interval: CandleInterval.H4 }),
    ).resolves.toEqual({
      symbol: 'BTC',
      interval: CandleInterval.H4,
      items: [],
      stale: false,
    });
  });

  it('includes candles on from and to bounds and drops those outside', async () => {
    const service = serviceWith([
      candle(T0),
      candle(T1),
      candle(T2),
      candle(T3),
    ]);

    const history = await service.getHistory({
      symbol: 'BTC',
      interval: CandleInterval.H4,
      from: new Date(T1),
      to: new Date(T2),
    });

    expect(history.items.map((item) => item.openTime.toISOString())).toEqual([
      T1,
      T2,
    ]);
  });

  it('returns the last limit candles in openTime ASC when from and to are omitted', async () => {
    const service = serviceWith([
      candle(T0),
      candle(T1),
      candle(T2),
      candle(T3),
    ]);

    const history = await service.getHistory({
      symbol: 'BTC',
      interval: CandleInterval.H4,
      limit: 2,
    });

    expect(history.items.map((item) => item.openTime.toISOString())).toEqual([
      T2,
      T3,
    ]);
  });

  // 501 > default 500: без limit отрезается самый старый бар.
  it('defaults limit to 500 when omitted', async () => {
    const items = Array.from({ length: 501 }, (_, index) =>
      candle(new Date(Date.UTC(2026, 0, 1, index)).toISOString()),
    );
    const service = serviceWith(items);

    const history = await service.getHistory({
      symbol: 'BTC',
      interval: CandleInterval.H4,
    });

    expect(history.items).toHaveLength(500);
    expect(history.items[0]?.openTime.toISOString()).toBe(
      items[1]?.openTime.toISOString(),
    );
    expect(history.items[499]?.openTime.toISOString()).toBe(
      items[500]?.openTime.toISOString(),
    );
  });

  // Сервис не знает HTTP: проверяем domain code, не 400.
  it('rejects from after to without looking up HTTP status', async () => {
    const service = serviceWith([candle(T0)]);

    await expect(
      service.getHistory({
        symbol: 'BTC',
        interval: CandleInterval.H4,
        from: new Date(T2),
        to: new Date(T1),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CANDLE_RANGE' });
  });
});
