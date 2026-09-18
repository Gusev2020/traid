# 03: GET /candles — пустая история и конверт

**Parent:** `.scratch/b2-symbols-candles-rest/spec.md`

**What to build:** Клиент запрашивает историю Candle по ticker и CandleInterval и всегда получает конверт `{ symbol, interval, items, stale }`, не голый массив. Пока нет синка, `stale` = false. Seed без свечей: известный Symbol → 200 и пустой `items`. Нет Symbol → 404 `SYMBOL_NOT_FOUND`. Неактивный Symbol обслуживается. Плохой query (нет полей, чужой interval, лишние поля) → 400. Ticker резолвится в репозитории свечей (vsCurrency `usd`), без импорта модуля символов.

**Blocked by:** 01 — GET /symbols/:ticker

**Status:** done

- [x] `GET /api/v1/candles?symbol=BTC&interval=H4` при отсутствии Candle → 200 `{ symbol: "BTC", interval: "H4", items: [], stale: false }`.
- [x] Неизвестный ticker → 404 `SYMBOL_NOT_FOUND`.
- [x] Неактивный Symbol с тем же query → 200, не 404.
- [x] Нет `symbol` или `interval`, или interval не `M30|H4|D4` → 400.
- [x] Лишнее query-поле → 400.
- [x] Ticker нормализуется в верхний регистр.
- [x] `CandlesModule` не импортирует `SymbolsModule`; резолв ticker + `usd` в репозитории свечей.
- [x] e2e на локальный Postgres; Candle в seed не добавляем. Swagger на роуте + `openapi:export`.
- [x] Эндпоинт публичный. Форма ответа — канон §7.1, не sequence §4.2.
