/**
 * Ошибки домена без HTTP-кодов (service не знает statusCode).
 *
 * AllExceptionsFilter читает поле code как есть: SYMBOL_NOT_FOUND,
 * а не NOTFOUND из имени Nest NotFoundException.
 *
 * Тикет 03 (GET /candles) бросает SymbolNotFoundError так же, как карточка Symbol.
 * Тикет 04 — InvalidCandleRangeError (from позже to).
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

/** Тикет 04: from позже to. HTTP 400 ставит filter, не сервис. */
export class InvalidCandleRangeError extends DomainError {
  constructor() {
    super('INVALID_CANDLE_RANGE', 'from must not be after to');
  }
}

/** Тикет 05: Symbol есть, Latest Candle нет. HTTP 404 ставит filter, не сервис. */
export class CandleNotFoundError extends DomainError {
  constructor() {
    super('CANDLE_NOT_FOUND', 'Latest Candle not found');
  }
}
