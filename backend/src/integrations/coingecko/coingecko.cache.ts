/**
 * Кэш ответов Source в памяти процесса (не Redis).
 *
 * Зачем: Candle Sync раз в минуту, кэш живёт 60 секунд — повторный вопрос
 * за ту же монету и тот же days не тратит квоту CoinGecko.
 *
 * Single-flight: десять одновременных «дай bitcoin / 1 день» ждут один
 * HTTP, а не шлют десять. Ключ задаёт Adapter: монета + валюта + days.
 *
 * Ошибки не запоминаем: следующий вызов может попробовать снова.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  COINGECKO_SETTINGS,
  type CoinGeckoSettings,
} from './coingecko.settings';

/** Одна запись кэша: данные и момент, когда они протухнут. */
type CacheEntry<T> = { data: T; expiresAt: number };

@Injectable()
export class CoinGeckoCache {
  /** Уже полученные свечи по ключу. */
  private readonly store = new Map<string, CacheEntry<unknown>>();
  /** Запросы, которые ещё летят: второй ждущий берёт тот же Promise. */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(COINGECKO_SETTINGS)
    private readonly settings: CoinGeckoSettings,
  ) {}

  /**
   * Отдать из кэша или сходить в Source.
   * fetch — что сделать при промахе (обычно HTTP + маппинг).
   */
  getOrFetch<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.data as T);
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const request = fetch()
      .then((data) => {
        this.store.set(key, {
          data,
          expiresAt: Date.now() + this.settings.cacheTtlMs,
        });
        return data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, request);
    return request;
  }
}
