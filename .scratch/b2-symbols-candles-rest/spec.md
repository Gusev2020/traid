# B2: Symbols + Candles REST

Status: ready-for-agent

Слой ROADMAP: **B2**. Источники: `ARCHITECTURE.md` §4.7 и §7.1, чек-лист B2, grilling в этом чате, словарь `CONTEXT.md`.

## Problem Statement

После B1 есть схема, seed из пяти Symbol и `/health`, но нет HTTP-API для списка инструментов и истории Candle. Без этого нельзя закрыть слой B2 и нельзя позже сгенерировать клиент из OpenAPI. Sequence diagram в §4.2 и таблица §7.1 расходятся по форме ответа `/candles`; поведение пустой истории, Latest Candle и поиска в документах не досказано.

## Solution

Публичные GET-эндпоинты поверх PostgreSQL: список и карточка Symbol, диапазон Candle и Latest Candle. Данные только из БД (seed + тестовые фикстуры). Контракт ответа `/candles` берём из таблицы §7.1, не из sequence. Swagger и `openapi:export` входят в слой, чтобы фронт позже собирал клиент из спеки, не из ручных типов.

## User Stories

1. As a chart client, I want a list of Symbol, so that I can pick an instrument without hardcoding tickers.
2. As a chart client, I want to search that list by a substring of ticker or name, so that I can find ETH without scrolling.
3. As a chart client, I want the list to show Active Symbol by default, so that retired instruments do not clutter the picker.
4. As a chart client, I want to request inactive Symbol as well, so that I can audit hidden instruments.
5. As a chart client, I want `total` alongside `items`, so that I can paginate without guessing the dataset size.
6. As a chart client, I want `limit` and `offset` on the list, so that I do not download every Symbol at once.
7. As a chart client, I want to open a Symbol by ticker, so that a saved URL like `/BTC` still works.
8. As a chart client, I want a ticker lookup to succeed for an inactive Symbol, so that a bookmark does not die when the instrument is taken off the default list.
9. As a chart client, I want ticker matching to ignore case, so that `btc` and `BTC` resolve to the same Symbol.
10. As a chart client, I want a clear 404 when the ticker does not exist, so that I can show “unknown instrument” instead of an empty chart.
11. As a chart client, I want OHLC history for a ticker and CandleInterval, so that I can draw a candlestick chart.
12. As a chart client, I want the history payload to include ticker, CandleInterval, items, and Stale, so that one response is enough to render the chart header and the series.
13. As a chart client, I want Stale to be false while there is no upstream sync, so that I do not show a “stale data” badge before CoinGecko exists.
14. As a chart client, I want optional `from` and `to` on history, so that I can load a visible time window.
15. As a chart client, I want that window to be inclusive on `openTime`, so that candles on the exact bounds are not dropped.
16. As a chart client, I want a 400 when `from` is after `to`, so that I get a contract error instead of an empty surprise.
17. As a chart client, I want a `limit` (default 500, max 1000) on history, so that a wide window cannot dump an unbounded series.
18. As a chart client, I want the last `limit` candles when I omit dates, so that the first paint shows the recent tail (same idea as a live snapshot of the last 500).
19. As a chart client, I want items ordered ascending by `openTime`, so that the chart library receives chronological points.
20. As a chart client, I want an empty `items` array when the Symbol exists but has no Candle, so that I can show an empty state instead of an error (seed has no candles yet).
21. As a chart client, I want history of an inactive Symbol, so that turning off sync does not erase the chart.
22. As a chart client, I want prices as strings, so that Decimal values are not rounded in JSON.
23. As a chart client, I want Volume always present: a string or null, so that missing source Volume is not confused with zero.
24. As a chart client, I want the Latest Candle for a ticker and CandleInterval, so that I can show the last bar without downloading the whole window.
25. As a chart client, I want 404 `CANDLE_NOT_FOUND` when the Symbol exists but there is no Latest Candle, so that I can distinguish “no bar yet” from “unknown ticker”.
26. As a chart client, I want 404 `SYMBOL_NOT_FOUND` on Latest Candle when the ticker is unknown, so that the two failures stay distinct.
27. As a chart client, I want 400 when required query fields are missing or CandleInterval is not `M30|H4|D4`, so that bad requests fail at the edge.
28. As a chart client, I want extra query fields rejected with 400, so that typos do not silently change the query.
29. As a chart client, I want vsCurrency fixed to `usd` in MVP, so that `BTC` is unambiguous.
30. As an API consumer, I want every B2 route in Swagger with examples, so that I can try them from `/docs`.
31. As a frontend build, I want `/docs-json` and a generated `openapi.json` without `listen()`, so that CI can export the contract without a running server.
32. As a backend developer, I want Controller → Service → Repository, so that Prisma types stay in the repository and HTTP stays in the controller.
33. As a backend developer, I want Candles to resolve ticker without importing Symbols, so that feature modules stay independent.
34. As a tester, I want unit tests on range bounds and empty history at the service, so that window logic is cheap to pin down.
35. As a tester, I want HTTP e2e on the local Postgres, so that 200/400/404 and whitelist are proven on the real pipe and filter.
36. As an operator, I want existing seed Symbol rows to survive e2e, so that local dev data is not truncated.

## Implementation Decisions

- Слой ROADMAP: **B2**. Эндпоинты **публичные** (в таблице §7.1 Auth = «—»). JWT, `@Public()`, глобальный guard — не в этом spec; до B4 все новые GET открыты так же, как `/health`.
- После изменения DTO/контроллеров обязателен **`openapi:export`**: OpenAPI 3 на `/docs` и `/docs-json`, файл спеки как артефакт backend. Тег `auth` в DocumentBuilder можно не наполнять роутами.
- Модули: `SymbolsModule` и `CandlesModule`, каждый Controller → Service → Repository. Регистрируются в корневом приложении рядом с уже существующими Health и Prisma.
- Схема Prisma **без изменений**: Symbol, Candle, CandleInterval уже есть. Seed по-прежнему только пять Symbol; Candle в seed не добавляем.
- `Candles` резолвит ticker как данные: поиск Symbol по ticker + `vsCurrency = usd` внутри репозитория свечей. `SymbolsModule` не импортируется.
- Глобальный ValidationPipe уже включён: whitelist + forbidNonWhitelisted + transform. Лишние поля → 400. Ticker в query и path нормализуется в верхний регистр.
- Ошибки идут через существующий AllExceptionsFilter и `ErrorResponseDto`. Сервис/контроллер обязан задать доменный `code`: `SYMBOL_NOT_FOUND` и `CANDLE_NOT_FOUND`, а не полагаться на `NOTFOUND` из имени `NotFoundException`.
- Канон ответа `GET /candles` — таблица §7.1, не sequence §4.2: `{ symbol, interval, items, stale }`. В B2 `stale` всегда `false`.
- `GET /symbols` query: `search?` (case-insensitive contains по ticker **или** name), `active` по умолчанию true (только Active Symbol; `active=false` — только неактивные), `limit` по умолчанию 50 максимум 100, `offset` по умолчанию 0. Ответ: `{ items, total }`, где `total` — число строк после фильтров, до limit/offset.
- `GET /symbols/:ticker` отдаёт Symbol включая неактивный. Нет строки → 404 `SYMBOL_NOT_FOUND`.
- `GET /candles` query: `symbol` и `interval` обязательны; `from?` и `to?` ISO-8601; `limit` 1..1000, по умолчанию 500. Окно по `openTime` **включительно**. Без `from`/`to` — последние `limit` свечей. `from > to` → 400. Ответ items всегда ASC по `openTime`. Нет Symbol → 404 `SYMBOL_NOT_FOUND`. Symbol есть, свечей нет → 200 и `items: []`. Неактивный Symbol обслуживается так же, как активный.
- `GET /candles/latest` query: `symbol` и `interval`. 200 — один Candle. Нет Symbol → `SYMBOL_NOT_FOUND`. Нет Latest Candle → `CANDLE_NOT_FOUND`.
- Денежные поля (open/high/low/close) в JSON — string. Volume — ключ всегда есть: string или `null`.
- `POST /candles/sync`, throttler/429, истинный Stale от circuit breaker — не реализовывать; в OpenAPI B2 для `/candles` достаточно задокументировать 400 и 404 (429 можно указать как будущий код, но не включать throttler).
- Swagger: `@ApiOperation`, `@ApiOkResponse`, `@ApiResponse` на нештатные коды, примеры на DTO.

## Testing Decisions

Хороший тест проверяет **внешнее поведение** шва: статус, `code`, форму JSON, порядок items, то что лишнее поле не применяется. Не проверяем SQL-текст, имена приватных методов и устройство Prisma.

**Шов 1 (основной, самый высокий) — HTTP.** Существующий e2e-харнесс: поднять приложение так же, как bootstrap-тест B1 (тот же configureApp), бить в GET через Supertest. Для B2 Prisma **не мокаем**: локальный Postgres из dev-окружения. Фикстуры Candle вставляются в тесте и в teardown удаляются только они; строки Symbol из seed не truncate. Покрывает: 200 списка и карточки, поиск/пагинация, 200 пустой истории, 200 диапазона (границы, хвост, ASC), 400 валидации и лишних полей, 404 `SYMBOL_NOT_FOUND` / `CANDLE_NOT_FOUND`, Volume `null`.

**Шов 2 (узкий, требует DoD B2) — сервис свечей.** Unit: сервис с замоканным репозиторием, как health-тесты B1 мокают индикаторы. Только правила окна: inclusive `from`/`to`, хвост при отсутствии дат, `from > to`, пустая история → пустой список (не not-found). HTTP-коды в сервисе не проверяем — сервис их не знает.

Репозиторий отдельным integration-слоем (Testcontainers) **не** вводим: локальный HTTP-e2e уже бьёт в реальную БД.

Порог покрытия из архитектуры не расширяем в этом spec; зелёные unit + e2e слоя достаточны для DoD B2 вместе с lint и `tsc --noEmit`.

## Out of Scope

- Frontend, генерация клиента на фронте, правка `ARCHITECTURE.md` / `ROADMAP.md`.
- B3: CoinGecko, кэш, backfill, scheduler, throttler, `stale: true`.
- B4: JWT, `@Public()`, WebSocket, `POST /candles/sync`.
- Seed Candle; пользователи; смена Prisma-схемы; Testcontainers; Redis.
- Параметр vsCurrency в URL; любые интервалы кроме `M30|H4|D4`.

## Further Notes

- Sequence §4.2 оставляем как упрощённую картинку потока; для агента канон — §7.1 и этот spec.
- Пустая история — основной локальный путь: seed без Candle.
- Следующий шаг цепочки: нарезка вертикальных тикетов (`/to-tickets`), не код.
