/**
 * Оркестрация Candle. Не знает HTTP-DTO и не ставит statusCode.
 * Карта файлов — candles.module.ts.
 *
 * Тикет 03 — getHistory:
 *   нет Symbol → SymbolNotFoundError (SYMBOL_NOT_FOUND, не NOTFOUND)
 *   Symbol есть, свечей нет → пустой items, не not-found
 *   isActive не фильтруем: неактивный Symbol обслуживается как активный
 *   stale всегда false, пока нет синка с CoinGecko (B3)
 *
 * Тикет 04 — окно:
 *   from/to по openTime включительно; без дат — хвост из limit, ответ ASC
 *   from позже to → InvalidCandleRangeError (filter → 400)
 *   limit по умолчанию 500
 *
 * Тикет 05 — getLatest:
 *   нет Symbol → SymbolNotFoundError (SYMBOL_NOT_FOUND)
 *   Symbol есть, Latest Candle нет → CandleNotFoundError (CANDLE_NOT_FOUND)
 *   isActive не фильтруем: неактивный Symbol обслуживается как активный
 *
 * Принимает поля, не GetCandlesQueryDto: HTTP остаётся в контроллере.
 */
import { Injectable } from '@nestjs/common';
import { CandleInterval } from '@prisma/client';
import {
  CandleNotFoundError,
  InvalidCandleRangeError,
  SymbolNotFoundError,
} from '../../common/errors/domain.error';
import { CandleRecord } from './candle.record';
import { CandlesRepository } from './candles.repository';

/** Конверт истории до HTTP: items ещё CandleRecord, stale — доменный флаг. */
export type CandleHistory = {
  symbol: string;
  interval: CandleInterval;
  items: CandleRecord[];
  stale: boolean;
};

/** Дубль default DTO: сервис могут вызвать без ValidationPipe. */
const DEFAULT_HISTORY_LIMIT = 500;

@Injectable()
export class CandlesService {
  constructor(private readonly candles: CandlesRepository) {}

  /**
   * Тикеты 03–04: резолв ticker → окно истории (пусто = []).
   * HTTP-коды ставит filter. from/to уже Date: ISO разобрал контроллер.
   */
  async getHistory(query: {
    symbol: string;
    interval: CandleInterval;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<CandleHistory> {
    // getTime(): Date > Date сравнивает объекты, не мгновения.
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      query.from.getTime() > query.to.getTime()
    ) {
      throw new InvalidCandleRangeError();
    }
    const symbolId = await this.candles.findSymbolIdByTicker(query.symbol);
    if (symbolId === null) {
      throw new SymbolNotFoundError(query.symbol);
    }
    const limit = query.limit ?? DEFAULT_HISTORY_LIMIT;
    // Без дат — хвост (как первый paint графика). С датами — ASC от from.
    const window = {
      from: query.from,
      to: query.to,
      limit,
      newestFirst: query.from === undefined && query.to === undefined,
    };
    const items = await this.candles.findHistory(
      symbolId,
      query.interval,
      window,
    );
    return {
      symbol: query.symbol,
      interval: query.interval,
      items: this.applyWindow(items, window),
      stale: false,
    };
  }

  /**
   * Тикет 05: Latest Candle пары ticker + CandleInterval.
   * HTTP-коды ставит filter. В отличие от getHistory, пустой ряд — ошибка:
   * клиенту latest нужен один бар, а не конверт с items: [].
   */
  async getLatest(query: {
    symbol: string;
    interval: CandleInterval;
  }): Promise<CandleRecord> {
    const symbolId = await this.candles.findSymbolIdByTicker(query.symbol);
    if (symbolId === null) {
      throw new SymbolNotFoundError(query.symbol);
    }
    const candle = await this.candles.findLatest(symbolId, query.interval);
    // Symbol жив, бара нет — не SYMBOL_NOT_FOUND: график отличит «ещё нет свечи».
    if (candle === null) {
      throw new CandleNotFoundError();
    }
    return candle;
  }

  /**
   * Истина правил окна. Unit мокает репозиторий полным набором без SQL-фильтра —
   * без этого теста на inclusive/хвост были бы тавтологией (вернули то, что мок отдал).
   * Prisma take/gte/lte — только чтобы не выгрузить всю таблицу.
   *
   * Inclusive: >= from и <= to, свечи на границах входят.
   * Нет дат → slice(-limit): последние N, порядок ASC уже есть.
   * Есть даты → slice(0, limit): начало ASC-окна, не хвост у to
   * (spec last-N формулирует только для запроса без дат).
   */
  private applyWindow(
    items: CandleRecord[],
    window: { from?: Date; to?: Date; limit: number },
  ): CandleRecord[] {
    const fromMs = window.from?.getTime();
    const toMs = window.to?.getTime();
    let filtered = items;
    if (fromMs !== undefined) {
      filtered = filtered.filter((item) => item.openTime.getTime() >= fromMs);
    }
    if (toMs !== undefined) {
      filtered = filtered.filter((item) => item.openTime.getTime() <= toMs);
    }
    if (window.from === undefined && window.to === undefined) {
      return filtered.slice(-window.limit);
    }
    return filtered.slice(0, window.limit);
  }
}
