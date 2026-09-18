# B3: CoinGecko + cache + Backfill

Status: ready-for-agent

Слой ROADMAP: **B3**. Источники: `ARCHITECTURE.md` §4.4, §4.8, §4.10, §4.11 и §7.1, чек-лист B3, grilling в этом чате, словарь `CONTEXT.md`. Швы согласованы в том же чате.

## Problem Statement

После B2 REST отдаёт Symbol и историю Candle только из PostgreSQL. Ряд пустой (seed без Candle), `stale` всегда ложь, Source ещё не подключён. Без слоя B3 нельзя наполнить историю, держать Latest Candle свежей и показать, что Source недоступен, не ломая GET. Frontend и JWT/WS в этот слой не входят.

## Solution

Подключить Source (CoinGecko OHLC): клиент с квотой и breaker, кэш с single-flight, маппинг в Candle. Писатели — **Candle Sync** (все Active Symbol, канон `days` 1/30/365) и CLI **Backfill**. Читатели GET по-прежнему только хранилище; `stale` становится истинным признаком недоступности Source. Снаружи: throttler на HTTP, некритичный индикатор Source на `/health`.

## User Stories

1. As a chart client, I want GET history to keep reading PostgreSQL only, so that user traffic does not spend Source quota.
2. As a chart client, I want GET Latest Candle to keep reading PostgreSQL only, so that the last bar is consistent with the history window.
3. As a chart client, I want `stale: false` when Source is available, so that I do not show a false “stale data” badge.
4. As a chart client, I want `stale: true` when Source is unavailable, so that I can show that the series was served without a live Source.
5. As a chart client, I want `200` and existing Candle items when Source is down, so that the chart still renders from storage.
6. As a chart client, I want an empty `items` array with `stale: false` when the Symbol exists, Source is up, and there has never been a successful Candle Sync, so that “no bars yet” is not Stale.
7. As a chart client, I want old Candle data with `stale: false` while Source is up, so that a quiet Candle Sync does not look like an outage.
8. As a chart client, I want Volume `null` on Candle from this Source, so that missing turnover is not shown as zero.
9. As a chart client, I want prices still as strings, so that Decimal precision from storage is unchanged.
10. As a chart client, I want a 429 with `Retry-After` when I flood history GET, so that one IP cannot scrape the API.
11. As a chart client, I want `/health` to stay reachable under flood, so that probes are not throttled with the public API.
12. As an operator, I want `/health` to remain HTTP 200 when Source is down and the database is up, so that the process is not restarted for a Source outage.
13. As an operator, I want `/health` details to show Source as degraded when the breaker is open, so that I can see the outage without inferring it from `stale`.
14. As an operator, I want Candle Sync every minute for every Active Symbol, so that Latest Candle moves without waiting for Backfill.
15. As an operator, I want Candle Sync to cover CandleInterval M30, H4 and D4 via Source `days` 1, 30 and 365, so that all three charts stay fresh on stable cache keys.
16. As an operator, I want Candle Sync to skip a tick while the previous tick is still running, so that two waves do not double Source quota.
17. As an operator, I want Candle Sync to upsert by natural key, so that an open Latest Candle’s OHLC can change.
18. As an operator, I want `lastSyncedAt` updated only when all three CandleInterval writes for that Symbol succeeded in the tick, so that the timestamp does not lie while D4 failed.
19. As an operator, I want inactive Symbol excluded from Candle Sync, so that retired instruments do not spend quota.
20. As an operator, I still want GET history for an inactive Symbol, so that turning off sync does not erase the chart.
21. As an operator, I want Backfill to load history on demand, so that the database can be filled before the first chart paint.
22. As an operator, I want `--all` to mean every Active Symbol, so that a full fill matches who Candle Sync will refresh.
23. As an operator, I want `--symbols` to take coingeckoId values, so that the CLI matches the Source URL and the architecture examples.
24. As an operator, I want a Ticker in `--symbols` to be reported as an error, so that `BTC` is not silently treated as a coingeckoId.
25. As an operator, I want `--all` and `--symbols` together to fail fast, so that the target set is never ambiguous.
26. As an operator, I want a run with neither `--all` nor `--symbols` to fail fast, so that a bare `--days` cannot hit every Active Symbol.
27. As an operator, I want `--days` required and only `1|7|14|30|90|180|365`, so that illegal values are not rounded.
28. As an operator, I want `--days=N` to fetch every CandleInterval that fits N, so that one command can fill M30, H4 and D4.
29. As an operator, I want M30 to always use Source `days=1`, so that the only legal M30 window is used.
30. As an operator, I want H4 to use the largest of `7|14|30` that is ≤ min(N, 30), so that `--days=7` does not secretly pull 30 days of H4.
31. As an operator, I want D4 only when N is `90|180|365`, using that N, so that D4 matches the requested horizon.
32. As an operator, I want Backfill to insert with skip-duplicates in chunks, so that a second run does not create duplicate Candle rows.
33. As an operator, I want `--resume` to skip a Symbol+CandleInterval that already has at least one Candle, so that I can fill M30 after a previous D4-only run.
34. As an operator, I want `--dry-run` to print the plan without calling Source and without writing, so that a rehearsal cannot open the breaker or spend quota.
35. As an operator, I want `--dry-run --resume` to read storage, so that skip vs would-fetch in the plan is true.
36. As an operator, I want Backfill to continue after one Symbol fails, so that a single 404 does not waste the rest of the run.
37. As an operator, I want exit code 1 if any Symbol failed, so that CI and cron notice.
38. As an operator, I want exit code 0 when every Symbol succeeded, so that a clean fill is observable.
39. As an operator, I want a final report of processed symbols, inserted, skipped and errors, so that I can see what the run did.
40. As an operator, I want Backfill to run sequentially by default, so that the Source token bucket is not stampeded.
41. As an operator, I want a 404 from Source on one coingeckoId not to mark history Stale, so that a typo in seed is not an outage badge on every chart.
42. As a backend developer, I want timeout 8s and retry 3× with backoff and jitter only on 429/5xx/network, so that a dead Source is not hammered on 4xx.
43. As a backend developer, I want `Retry-After` on 429 to be waited without incrementing the retry counter, so that we honour Source cooldown.
44. As a backend developer, I want an internal token bucket of 50 requests/min that waits instead of failing, so that we stay under the Demo plan.
45. As a backend developer, I want in-memory cache TTL 60s and single-flight per cache key, so that parallel callers share one Source request.
46. As a backend developer, I want cache keys `ohlc:{coingeckoId}:{vsCurrency}:{days}`, so that Candle Sync’s 1/30/365 stay stable and distinct from a narrower Backfill.
47. As a backend developer, I want five consecutive Source errors to open the breaker for 60s, so that GET can serve Stale instead of a request storm.
48. As a backend developer, I want 4xx other than 429 not to count toward the breaker, so that one bad coingeckoId does not declare Source down.
49. As a backend developer, I want a Zod failure on a Source payload to reject the whole response and count as a breaker error, so that no partial garbage is stored.
50. As a backend developer, I want half-open after 60s with a single probe, so that recovery does not storm and Stale does not last until process restart.
51. As a backend developer, I want integrations not to touch the database, so that mapping stays a deep module and upsert stays in the candles repository.
52. As a backend developer, I want Source env vars validated at boot, so that a missing base URL fails fast like other config.
53. As a backend developer, I want an empty Demo API key to remain allowed, so that local boot matches the published env example.
54. As a tester, I want Source calls intercepted, so that CI never reaches the live CoinGecko host.
55. As a tester, I want ten parallel Adapter calls for one key to produce one HTTP fetch, so that single-flight is proven at the facade.
56. As a tester, I want Backfill re-run to keep the Candle count stable, so that idempotency is proven on the composite key.
57. As an API consumer, I want 429 documented on history GET in OpenAPI, so that the generated client later knows the code.
58. As a frontend build, I want `openapi:export` after this contract change, so that `stale` meaning and 429 stay in the artefact.
59. As a future B4 implementer, I want Candle Sync’s *set* of Symbol to be replaceable, so that subscriber counting can replace “all Active Symbol” without rewriting cron.

## Implementation Decisions

- Слой ROADMAP: **B3**. Существующие GET остаются **публичными** (как в B2; JWT / `@Public()` / глобальный `JwtAuthGuard` — B4). `POST /candles/sync` в этот spec не входит.
- После изменения контракта (`stale` больше не константа; 429 на истории) обязателен **`openapi:export`**.
- Схема Prisma **без изменений**. Seed по-прежнему только Symbol; Candle в seed не добавляем.
- Стек Source: Adapter (доменный фасад `getOhlc` → Candle[]) → Cache (in-memory Map, TTL 60s, single-flight) → Client (timeout 8s, header Demo API key, retry 3× backoff+jitter только 429/5xx/сеть, token bucket 50/min с ожиданием, учёт `Retry-After`, breaker). Без cache-manager и без Redis. Интеграционный слой не пишет в БД.
- Маппинг Source: массив `[ts, open, high, low, close]` → Candle; Volume всегда `null`; `days` → CandleInterval как в архитектуре (1 → M30, 2–30 → H4, ≥31 → D4). Легальные `days` запроса: `1|7|14|30|90|180|365`.
- GET `/candles` и `/candles/latest` **не** вызывают Source. `stale` на конверте истории = breaker **open**. Latest Candle по-прежнему без поля `stale`.
- Breaker: в счётчик идут timeout, сеть, 5xx, 429 после исчерпания retry, отказ Zod (весь payload, без частичной записи). Прочие 4xx (включая 404) не считаются. 5 подряд → open 60s → half-open с одним probe; успех закрывает и сбрасывает счётчик, неуспех снова open 60s. Пока open, Client не ходит в сеть.
- Candle Sync: cron 60s (интервал из env, как в example). Множество в B3 — все Active Symbol, все три CandleInterval через канон `days` 1/30/365. In-flight тик → следующий пропускается. Запись — upsert по PK `(symbolId, interval, openTime)`. `lastSyncedAt` обновляется только если все три интервала этого Symbol в тике записались; 404 на id не обновляет. Неактивный Symbol тик не синхронизирует. В B4 сменится источник множества (подписчики), не сам ритм cron.
- Backfill: отдельный CLI через application context без HTTP-listen. Флаги: `--all` XOR `--symbols`, `--days` обязателен, `--dry-run`, `--resume`, `--concurrency` по умолчанию 1 (из архитектуры). `--symbols` — только coingeckoId. Нелегальный `--days` или конфликт флагов — ошибка CLI, без округления. Расшифровка N: M30 всегда `days=1`; при N≥2 H4 = max `{7,14,30}` ≤ min(N,30); D4 только если N ∈ `{90,180,365}`. Запись — `createMany` с skipDuplicates чанками по 1000. По символам последовательно при concurrency 1. Ошибка одного Symbol — строка в отчёте, остальные продолжают, exit 1 если была хоть одна ошибка. `--resume` пропускает пару Symbol+CandleInterval с уже существующей Candle. `--dry-run` не вызывает Source и не пишет; SELECT для плана `--resume` разрешён.
- HTTP throttler: три уровня short/medium/long как в архитектуре, глобальный guard, `trust proxy`. `@SkipThrottle` на `/health`. Точечный лимит login — B4.
- `/health`: индикатор Source по состоянию breaker, не критичный (`degraded`, HTTP 200 при живой БД). Индикаторы database и heap сохраняются.
- Env: валидировать CoinGecko base URL, опциональный API key, rate limit, cache TTL, интервал Candle Sync. JWT-секреты по-прежнему не валидировать (B4).
- Логи: info на синхронизации, warn на 429 и open breaker; без живого Source в тестах.
- Ошибки GET из-за Source не превращаются в 503: история 200 + `stale: true`. `CoinGeckoUnavailableException` на публичном GET не отдаём.

## Testing Decisions

Хороший тест проверяет **внешнее поведение** шва: HTTP-статус и тело, exit code, число запросов в nock, идемпотентность числа Candle. Не проверяем SQL-текст, приватные методы, внутренность token bucket и устройство Map.

**Шов 1 (основной) — HTTP e2e.** Существующий харнесс B2: тот же bootstrap, Supertest, живой Postgres, seed Symbol не truncate. Cron выключен; тест явно запускает один тик Candle Sync. Source только через nock. Покрывает: флуд истории → 429 + `Retry-After`; после пяти ошибок Source → GET истории 200 + `stale: true` и items из БД; закрытый breaker / никогда не было sync → `stale: false`; `/health` 200 при degraded Source; `/health` без throttling; неактивный Symbol тик не пишет; успешный тик обновляет Latest Candle; `lastSyncedAt` только после трёх интервалов.

**Шов 2 — фасад Adapter + nock, без БД.** Один вход, без отдельных сюит на Client и Cache. Покрывает: retry на 429/5xx и не retry на 4xx; битый payload → ошибка; 10 параллельных вызовов одного ключа → 1 HTTP; TTL + single-flight; 5 ошибок → open; half-open — один probe; 404 breaker не открывает; исчерпание bucket — ожидание, не отказ.

**Шов 3 — CLI Backfill.** Application context + argv, nock, тот же Postgres. Покрывает: `--all` XOR `--symbols`; обязательный легальный `--days`; только coingeckoId; `--dry-run` без HTTP и без записи, с SELECT для `--resume`; resume на Symbol+CandleInterval; один 404 → остальные идут, exit 1; повторный прогон без дублей.

Живой хост CoinGecko запрещён во всех швах. Testcontainers и отдельный integration-слой репозитория не вводим. Порог coverage из архитектуры этим spec не расширяем: зелёные тесты трёх швов + lint + `tsc --noEmit` достаточны для DoD B3.

## Out of Scope

- Frontend, генерация клиента на фронте, правка `ARCHITECTURE.md` / `ROADMAP.md`.
- B4: JWT, `@Public()`, WebSocket, `POST /candles/sync`, `@Throttle` на login, счётчик подписчиков как источник множества Candle Sync.
- Redis, `@nestjs/cache-manager`, смена Prisma-схемы, seed Candle.
- vsCurrency в URL; CandleInterval кроме `M30|H4|D4`.
- Округление нелегального `--days`; приём Ticker в `--symbols`.
- Живые вызовы Source из тестов.

## Further Notes

- Sequence §4.2 (GET → только БД) — канон чтения; диаграмма слоёв §4.4 описывает писателей (Sync/Backfill), не GET.
- «N клиентов = 1 запрос к Source» относится к кэшу писателей и к overlapping tick, не к GET.
- Следующий шаг цепочки: нарезка вертикальных тикетов (`/to-tickets`), не код.
