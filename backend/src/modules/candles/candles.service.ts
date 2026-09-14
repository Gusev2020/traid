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
 * Принимает поля, не GetCandlesQueryDto: HTTP остаётся в контроллере.
 * Окно from/to/limit — тикет 04.
 */
import { Injectable } from '@nestjs/common';
import { CandleInterval } from '@prisma/client';
import { SymbolNotFoundError } from '../../common/errors/domain.error';
import { CandleRecord } from './candle.record';
import { CandlesRepository } from './candles.repository';

/** Конверт истории до HTTP: items ещё CandleRecord, stale — доменный флаг. */
export type CandleHistory = {
  symbol: string;
  interval: CandleInterval;
  items: CandleRecord[];
  stale: boolean;
};

@Injectable()
export class CandlesService {
  constructor(private readonly candles: CandlesRepository) {}

  /** Тикет 03: резолв ticker → история (пусто = []). HTTP-коды ставит filter. */
  async getHistory(query: {
    symbol: string;
    interval: CandleInterval;
  }): Promise<CandleHistory> {
    const symbolId = await this.candles.findSymbolIdByTicker(query.symbol);
    if (symbolId === null) {
      throw new SymbolNotFoundError(query.symbol);
    }
    const items = await this.candles.findHistory(symbolId, query.interval);
    return {
      symbol: query.symbol,
      interval: query.interval,
      items,
      stale: false,
    };
  }
}
