/**
 * Предохранитель Source: после серии сбоев перестаём долбить CoinGecko.
 *
 * Зачем: если биржа лежит, каждый Sync не должен слать ещё запросы.
 * Тикет 03 по isCircuitOpen() покажет «данные могут быть старые».
 *
 * 5 подряд плохих ответов (таймаут, сеть, 5xx, 429 после всех повторов,
 * кривой JSON) → пауза 60 секунд. Потом один пробный запрос.
 * 404 «нет такой монеты» сюда не входит: это опечатка в id, не падение биржи.
 */
import { Injectable, Logger } from '@nestjs/common';
import { SourceUnavailableError } from './source.errors';

/** Сколько аварий подряд открывают предохранитель. */
const FAILURE_THRESHOLD = 5;
/** Сколько миллисекунд держим «закрыто, в сеть не ходим». */
const OPEN_MS = 60_000;

/** closed — работаем; open — пауза; half-open — один пробный запрос. */
type BreakerState = 'closed' | 'open' | 'half-open';

const Closed: BreakerState = 'closed';
const Open: BreakerState = 'open';
const HalfOpen: BreakerState = 'half-open';

@Injectable()
export class SourceCircuitBreaker {
  private readonly logger = new Logger(SourceCircuitBreaker.name);
  private state: BreakerState = Closed;
  /** Счётчик аварий подряд. Успех обнуляет. */
  private failures = 0;
  /** Когда открыли предохранитель — от этой отметки считаем 60 секунд. */
  private openedAt = 0;
  /** Пробный запрос уже летит: второй параллельный не пускаем. */
  private probeInFlight = false;

  /**
   * Source сейчас «как будто лежит»?
   * true и на паузе, и пока пробный запрос не доказал, что биржа ожила.
   */
  isOpen(): boolean {
    this.maybeHalfOpen();
    return this.state === Open || this.state === HalfOpen;
  }

  /** Можно ли сейчас идти в сеть. Нет — бросаем SourceUnavailableError. */
  allow(): void {
    this.maybeHalfOpen();
    if (this.state === Open) {
      throw new SourceUnavailableError();
    }
    if (this.state === HalfOpen) {
      if (this.probeInFlight) {
        throw new SourceUnavailableError();
      }
      this.probeInFlight = true;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = Closed;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    this.probeInFlight = false;
    if (this.state === HalfOpen) {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= FAILURE_THRESHOLD) {
      this.trip();
    }
  }

  /** Ответ пришёл, но это не успех (например 404). Счётчик аварий не трогаем. */
  recordNeutral(): void {
    this.probeInFlight = false;
  }

  /** Пауза вышла — разрешаем один пробный запрос. */
  private maybeHalfOpen(): void {
    if (this.state === Open && Date.now() - this.openedAt >= OPEN_MS) {
      this.state = HalfOpen;
    }
  }

  private trip(): void {
    this.state = Open;
    this.openedAt = Date.now();
    this.logger.warn('Source circuit breaker open');
  }
}
