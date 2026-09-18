# 02: GET /symbols — список, поиск, страница

**Parent:** `.scratch/b2-symbols-candles-rest/spec.md`

**What to build:** Клиент получает страницу Symbol: `{ items, total }`. По умолчанию только Active Symbol. Подстрока `search` ищет в ticker или name без учёта регистра. `limit`/`offset` режут выдачу; `total` — число после фильтров, до страницы. Лишние query-поля — 400.

**Blocked by:** 01 — GET /symbols/:ticker

**Status:** done

- [x] `GET /api/v1/symbols` без query → только Active Symbol, `limit` по умолчанию 50, есть `total`.
- [x] `search` — case-insensitive contains по ticker **или** name.
- [x] `active=false` → только неактивные; параметр по умолчанию ведёт себя как true.
- [x] `limit` максимум 100; `offset` сдвигает страницу; `total` не равен длине текущей страницы, если записей больше.
- [x] Лишнее query-поле → 400 (глобальный forbidNonWhitelisted).
- [x] Невалидные `limit`/`offset` → 400.
- [x] e2e на локальный Postgres, без truncate seed. Swagger на роуте + `openapi:export`.
