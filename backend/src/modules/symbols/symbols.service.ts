/**
 * Оркестрация Symbol: решает «нашлась ли карточка?».
 *
 * Не знает HTTP: не бросает NotFoundException и не ставит statusCode.
 * Нет строки в БД → доменный SymbolNotFoundError с кодом SYMBOL_NOT_FOUND.
 * AllExceptionsFilter мапит его в 404 (см. common/filters).
 *
 * Неактивный Symbol — валидная карточка: фильтр isActive здесь не ставится
 * (список по умолчанию скроет его, bookmark /BTC — нет).
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
}
