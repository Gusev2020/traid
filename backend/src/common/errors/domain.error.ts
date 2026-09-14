/**
 * Ошибки домена без HTTP-кодов (service не знает statusCode).
 *
 * AllExceptionsFilter читает поле code как есть: SYMBOL_NOT_FOUND,
 * а не NOTFOUND из имени Nest NotFoundException.
 *
 * Тикет 03 (GET /candles) бросает SymbolNotFoundError так же, как карточка Symbol.
 * CANDLE_NOT_FOUND — тикет 05 (latest), тот же базовый класс.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class SymbolNotFoundError extends DomainError {
  constructor(ticker: string) {
    super('SYMBOL_NOT_FOUND', `Symbol ${ticker} not found`);
  }
}
