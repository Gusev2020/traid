---
name: coingecko-adapter-change
description: Changes the CoinGecko integration (client, adapter, cache, circuit breaker, backfill) with nock tests. Use when editing integrations/coingecko, CandleSyncScheduler, or backfill.ts.
---

# Правки CoinGecko

Стек: `CoinGeckoAdapter` → `CoinGeckoCache` (TTL 60s, single-flight) → `CoinGeckoClient` (timeout 8s, retry 3x только 429/5xx, token bucket 50/min, Retry-After, circuit breaker).

- Маппинг `[ts,o,h,l,c]` → Candle + Zod внешнего payload. `days` → `CandleInterval` (1→M30, 2–30→H4, ≥31→D4). Volume нет — `null`.
- Не ходить в БД из `integrations/`. Upsert — `CandlesRepository`.
- Тесты: `nock`, без сети. Обязательно: retry на 429/5xx и не retry на 4xx; битый payload; 10 параллельных вызовов → 1 HTTP (single-flight); circuit open → сервис отдаёт данные БД со `stale: true`.
- Backfill: последовательно по символам, `createMany({ skipDuplicates: true })`, exit 1 при ошибке. Идемпотентность — тест повторного прогона.

Не звать живой api.coingecko.com из unit/e2e.
