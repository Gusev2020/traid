# 01: GET /symbols/:ticker — карточка из seed

**Parent:** `.scratch/b2-symbols-candles-rest/spec.md`

**What to build:** Клиент запрашивает Symbol по ticker и получает карточку из seed (BTC и остальные пять). Неизвестный ticker даёт 404 с кодом `SYMBOL_NOT_FOUND`. Регистр не важен (`btc` = `BTC`). Неактивный Symbol всё равно открывается. Роут виден в Swagger; `openapi:export` уже умеет выгрузить спеку без `listen()`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `GET /api/v1/symbols/BTC` → 200 с полями Symbol (ticker, name, coingeckoId, vsCurrency, isActive, lastSyncedAt).
- [x] `GET /api/v1/symbols/btc` → тот же Symbol, что и `BTC`.
- [x] Несуществующий ticker → 404, `code` = `SYMBOL_NOT_FOUND` (не `NOTFOUND` из имени исключения).
- [x] Неактивный Symbol по ticker → 200, не 404.
- [x] e2e на локальный Postgres; seed-символы не truncate.
- [x] Роут задокументирован в Swagger с примером; `/docs-json` отдаёт OpenAPI 3; `openapi:export` пишет спеку одной командой.
- [x] Эндпоинт публичный (без JWT). Слой ROADMAP B2. `SymbolsModule`: Controller → Service → Repository.
