# 04: GET /candles — окно from / to / limit

**Parent:** `.scratch/b2-symbols-candles-rest/spec.md`

**What to build:** Клиент задаёт окно истории: optional `from`/`to` (ISO-8601, по `openTime` включительно) и `limit` (1..1000, по умолчанию 500). Без дат приходят последние `limit` свечей. В JSON items всегда по возрастанию `openTime`. `from` позже `to` → 400. Цены — строки; Volume всегда в объекте: строка или `null`. Тестовые свечи вставляются в e2e и удаляются только они.

**Blocked by:** 03 — GET /candles (пустая история и конверт)

**Status:** done

- [x] Inclusive `from`/`to`: свечи на границах входят в `items`.
- [x] Без `from`/`to` — хвост из `limit` свечей, в ответе ASC по `openTime`.
- [x] `from > to` → 400.
- [x] `limit` по умолчанию 500, выше 1000 или ниже 1 → 400.
- [x] open/high/low/close в JSON — string; Volume — string или `null`, ключ присутствует.
- [x] Unit сервиса с моком репозитория: границы окна, хвост без дат, `from > to`, пустая история → пустой список (не not-found). HTTP-коды в unit не проверяем.
- [x] e2e на локальный Postgres с фикстурами Candle; afterEach удаляет только эти свечи. `openapi:export`.
