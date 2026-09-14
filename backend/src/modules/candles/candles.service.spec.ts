/**
 * Unit-шов тикета 03 (spec Testing Decisions, шов 2): пустая история → []
 * (не not-found). HTTP-шов — test/candles.e2e-spec.ts.
 *
 * Репозиторий замокан, как health-тесты B1 мокают индикаторы.
 * HTTP-коды здесь не проверяем — сервис их не знает.
 * Правила окна from/to/limit — тикет 04.
 */
import { CandleInterval } from '@prisma/client';
import { CandlesRepository } from './candles.repository';
import { CandlesService } from './candles.service';

describe('CandlesService', () => {
  it('returns empty items when the Symbol exists but has no Candle', async () => {
    const candles = {
      findSymbolIdByTicker: jest.fn().mockResolvedValue(1),
      findHistory: jest.fn().mockResolvedValue([]),
    };
    const service = new CandlesService(candles as unknown as CandlesRepository);

    await expect(
      service.getHistory({ symbol: 'BTC', interval: CandleInterval.H4 }),
    ).resolves.toEqual({
      symbol: 'BTC',
      interval: CandleInterval.H4,
      items: [],
      stale: false,
    });
  });
});
