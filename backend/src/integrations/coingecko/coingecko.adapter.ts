/**
 * Переводчик между CoinGecko и нашим кодом.
 *
 * Снаружи одна функция getOhlc: «дай свечи по монете». Внутри:
 * кэш (не спрашивать Source повторно), HTTP-клиент, проверка ответа, маппинг
 * в Candle. В PostgreSQL отсюда ничего не пишется — это делают Sync и Backfill.
 *
 * Зачем отдельный файл, а не сразу Client: кэш должен хранить уже готовые
 * свечи, а не сырой JSON. Предохранитель (breaker) тоже здесь: 404 на
 * опечатке в id монеты не считается «биржа упала». Тикет 03 спросит
 * isCircuitOpen(), не ходя в сеть.
 */
import { Injectable } from '@nestjs/common';
import { CandleInterval } from '@prisma/client';
import { z } from 'zod';
import { CoinGeckoCache } from './coingecko.cache';
import { CoinGeckoClient } from './coingecko.client';
import { SourceCircuitBreaker } from './source-circuit-breaker';
import {
  SourceHttpError,
  SourceNetworkError,
  SourcePayloadError,
  SourceUnavailableError,
} from './source.errors';

/** Какие значения days CoinGecko принимает. Другие не округляем — сразу ошибка. */
const LEGAL_DAYS = new Set([1, 7, 14, 30, 90, 180, 365]);

// Одна свеча у Source — ровно 5 чисел: время, open, high, low, close. Нет volume.
const ohlcRowSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

/** Весь ответ Source: массив таких свечей. Одна битая строка — отказ всего массива. */
const ohlcPayloadSchema = z.array(ohlcRowSchema);

/** Что передать в getOhlc: какую монету, в какой валюте, за сколько дней. */
export type SourceOhlcQuery = {
  /** Id монеты у CoinGecko, например bitcoin. Не тикер BTC. */
  coingeckoId: string;
  /** Валюта цены. В MVP всегда usd. */
  vsCurrency: string;
  /** Горизонт запроса к Source: 1, 7, 14, 30, 90, 180 или 365. */
  days: number;
};

/** Одна свеча после перевода из ответа Source. */
export type SourceCandle = {
  interval: CandleInterval;
  openTime: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  /** У CoinGecko OHLC оборота нет — не подставляем 0, пишем «неизвестно». */
  volume: null;
};

@Injectable()
export class CoinGeckoAdapter {
  constructor(
    private readonly cache: CoinGeckoCache,
    private readonly client: CoinGeckoClient,
    private readonly breaker: SourceCircuitBreaker,
  ) {}

  /**
   * Source сейчас недоступен? Нужно тикету 03: бейдж stale на графике
   * и пункт coingecko в /health. true, пока предохранитель открыт
   * или идёт пробный запрос после паузы.
   */
  isCircuitOpen(): boolean {
    return this.breaker.isOpen();
  }

  /**
   * Свечи по монете за выбранный горизонт.
   * Сначала кэш, при промахе — сеть. Не пишет в базу.
   */
  getOhlc(query: SourceOhlcQuery): Promise<SourceCandle[]> {
    if (!LEGAL_DAYS.has(query.days)) {
      return Promise.reject(new Error(`Illegal Source days: ${query.days}`));
    }
    // Один ключ = одна комбинация монета + валюта + days. По нему делят кэш.
    const key = `ohlc:${query.coingeckoId}:${query.vsCurrency}:${query.days}`;
    return this.cache.getOrFetch(key, () => this.fetchMapped(query));
  }

  /** Реальный поход в Source: предохранитель → HTTP → проверка → свечи. */
  private async fetchMapped(query: SourceOhlcQuery): Promise<SourceCandle[]> {
    // Сюда попадаем только после промаха кэша. allow() — можно ли вообще звать Source.
    this.breaker.allow();
    try {
      const raw = await this.client.getOhlc(
        query.coingeckoId,
        query.vsCurrency,
        query.days,
      );
      const candles = mapPayload(raw, query.days);
      this.breaker.recordSuccess();
      return candles;
    } catch (error) {
      this.recordBreaker(error);
      throw error;
    }
  }

  /** Решаем, считать ли ошибку аварией Source (открыть предохранитель) или нет. */
  private recordBreaker(error: unknown): void {
    if (error instanceof SourceUnavailableError) {
      return;
    }
    if (error instanceof SourcePayloadError) {
      this.breaker.recordFailure();
      return;
    }
    if (error instanceof SourceNetworkError) {
      this.breaker.recordFailure();
      return;
    }
    if (error instanceof SourceHttpError) {
      if (error.status === 429 || error.status >= 500) {
        this.breaker.recordFailure();
        return;
      }
      // 404: такой монеты нет. Биржа отвечает — это не падение Source.
      this.breaker.recordNeutral();
      return;
    }
    this.breaker.recordFailure();
  }
}

/** JSON Source → наши свечи. Не прошло проверку — ни одной свечи не возвращаем. */
function mapPayload(raw: unknown, days: number): SourceCandle[] {
  const parsed = ohlcPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SourcePayloadError();
  }
  const interval = intervalFromDays(days);
  return parsed.data.map(([ts, open, high, low, close]) => ({
    interval,
    openTime: new Date(ts),
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: null,
  }));
}

/**
 * days задаёт, насколько мелкие свечи отдаст CoinGecko:
 * 1 день → 30 минут, до месяца → 4 часа, дальше → 4 дня.
 */
function intervalFromDays(days: number): CandleInterval {
  if (days === 1) {
    return CandleInterval.M30;
  }
  if (days <= 30) {
    return CandleInterval.H4;
  }
  return CandleInterval.D4;
}
