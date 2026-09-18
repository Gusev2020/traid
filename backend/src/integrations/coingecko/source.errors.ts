/**
 * Ошибки при разговоре с CoinGecko.
 *
 * Это не ошибки HTTP API для браузера. График при «бирже лежит» всё равно
 * получит 200 и свечи из нашей БД (тикет 03). Эти классы ловят Sync и Backfill:
 * одна монета сломалась — остальные можно грузить дальше.
 */
/** JSON ответа не похож на массив свечей. */
export class SourcePayloadError extends Error {
  constructor() {
    super('Source OHLC payload rejected');
    this.name = 'SourcePayloadError';
  }
}

/** Предохранитель открыт: в сеть сейчас не ходим. */
export class SourceUnavailableError extends Error {
  constructor() {
    super('Source circuit breaker is open');
    this.name = 'SourceUnavailableError';
  }
}

/** CoinGecko ответил кодом вроде 404 или 500. status — какой именно. */
export class SourceHttpError extends Error {
  constructor(readonly status: number) {
    super(`Source HTTP ${status}`);
    this.name = 'SourceHttpError';
  }
}

/** До ответа не дошли: таймаут, обрыв сети. */
export class SourceNetworkError extends Error {
  constructor(cause?: unknown) {
    super('Source network error');
    this.name = 'SourceNetworkError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
