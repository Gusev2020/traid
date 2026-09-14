/**
 * Оркестрация Symbol. Не знает HTTP-DTO и не ставит statusCode.
 *
 * Тикет 01 — getByTicker: нет строки → SymbolNotFoundError (SYMBOL_NOT_FOUND).
 * AllExceptionsFilter мапит его в 404. isActive здесь не фильтруем:
 * список (тикет 02) скроет неактивный, bookmark /BTC — нет.
 *
 * Тикет 02 — list: подставляет defaults и отдаёт вызов в SymbolsRepository.findPage.
 * Принимает поля, не ListSymbolsQueryDto: HTTP остаётся в контроллере.
 * total считает репозиторий (после фильтров, до limit/offset).
 */
import { Injectable } from '@nestjs/common';
import { SymbolNotFoundError } from '../../common/errors/domain.error';
import { SymbolRecord } from './symbol.record';
import { SymbolsRepository } from './symbols.repository';

@Injectable()
export class SymbolsService {
  constructor(private readonly symbols: SymbolsRepository) {}

  async getByTicker(ticker: string): Promise<SymbolRecord> {
    const symbol = await this.symbols.findByTicker(ticker);
    if (!symbol) {
      throw new SymbolNotFoundError(ticker);
    }
    return symbol;
  }

  /**
   * Страница списка. active/limit/offset страхуем ?? на случай вызова без DTO
   * (e2e всегда идёт через ValidationPipe, там defaults уже на классе).
   */
  async list(query: {
    search?: string;
    active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SymbolRecord[]; total: number }> {
    return this.symbols.findPage({
      search: query.search,
      isActive: query.active ?? true,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }
}
