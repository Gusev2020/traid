# 01: HTTP throttler — флуд истории → 429

**Parent:** `.scratch/b3-coingecko-cache-backfill/spec.md`

**What to build:** Клиент, который слишком часто бьёт в историю Candle, получает 429 и `Retry-After`. Пробы `/health` при том же флуде остаются 200. Контракт 429 появляется в OpenAPI истории. Source ещё не подключаем; GET по-прежнему из PostgreSQL, `stale` пока как в B2.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Флуд `GET /api/v1/candles` с одного IP → 429 и заголовок `Retry-After`.
- [x] Три уровня short/medium/long, глобальный guard, `trust proxy` — как в архитектуре.
- [x] `GET /health` при том же флуде → 200 (`SkipThrottle`).
- [x] Существующие e2e истории/символов не ломаются на обычной нагрузке теста.
- [x] 429 задокументирован на истории в Swagger; `openapi:export` обновляет артефакт.
- [x] Эндпоинты остаются публичными. Слой ROADMAP B3. JWT / login throttle — не в этом тикете.
