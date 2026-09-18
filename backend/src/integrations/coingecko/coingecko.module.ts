/**
 * Модуль CoinGecko: собирает переводчик, кэш, HTTP-клиент и предохранитель.
 *
 * Снаружи приложения виден только CoinGeckoAdapter («дай свечи»).
 * Остальное — внутренности. В базу и в GET /candles этот модуль не ходит.
 * Sync и Backfill будут звать Adapter; график — тикет 03 через isCircuitOpen().
 *
 * Файлы:
 *   adapter.ts                 перевод JSON Source → наши свечи
 *   cache.ts                   «уже спрашивали — отдать из памяти»
 *   client.ts                  сам HTTP к CoinGecko
 *   source-circuit-breaker.ts  предохранитель после серии сбоев
 *   source.errors.ts           ошибки для Sync/Backfill, не для браузера
 *   settings.ts                настройки (URL, ключ, лимит, TTL)
 *   adapter.spec.ts            проверки через поддельный HTTP (nock)
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoinGeckoAdapter } from './coingecko.adapter';
import { CoinGeckoCache } from './coingecko.cache';
import { CoinGeckoClient } from './coingecko.client';
import {
  COINGECKO_REQUEST_TIMEOUT_MS,
  COINGECKO_SETTINGS,
  type CoinGeckoSettings,
} from './coingecko.settings';
import { SourceCircuitBreaker } from './source-circuit-breaker';

@Module({
  providers: [
    {
      provide: COINGECKO_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CoinGeckoSettings => ({
        baseUrl: config.getOrThrow<string>('coingecko.baseUrl'),
        apiKey: config.get<string>('coingecko.apiKey') ?? '',
        rateLimitPerMin: config.getOrThrow<number>('coingecko.rateLimitPerMin'),
        cacheTtlMs: config.getOrThrow<number>('coingecko.cacheTtlMs'),
        // 8 секунд на запрос — из spec, не из .env, чтобы стенды не ставили «бесконечность».
        timeoutMs: COINGECKO_REQUEST_TIMEOUT_MS,
      }),
    },
    CoinGeckoCache,
    CoinGeckoClient,
    SourceCircuitBreaker,
    CoinGeckoAdapter,
  ],
  exports: [CoinGeckoAdapter],
})
export class CoinGeckoModule {}
