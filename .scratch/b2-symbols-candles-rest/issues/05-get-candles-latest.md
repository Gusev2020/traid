# 05: GET /candles/latest — последняя свеча

**Parent:** `.scratch/b2-symbols-candles-rest/spec.md`

**What to build:** Клиент запрашивает Latest Candle по ticker и CandleInterval. Есть бар → 200 один Candle (цены string, Volume string|null). Symbol есть, баров нет → 404 `CANDLE_NOT_FOUND`. Нет Symbol → 404 `SYMBOL_NOT_FOUND`. После тикета в OpenAPI все четыре GET слоя B2.

**Blocked by:** 03 — GET /candles (пустая история и конверт)

**Status:** done

- [x] При наличии фикстур → 200 Latest Candle (наибольший `openTime` для пары Symbol + CandleInterval).
- [x] Symbol есть, свечей нет → 404 `CANDLE_NOT_FOUND` (не `SYMBOL_NOT_FOUND`).
- [x] Неизвестный ticker → 404 `SYMBOL_NOT_FOUND`.
- [x] Нет `symbol`/`interval` или лишние поля → 400.
- [x] Неактивный Symbol с историей → 200, как активный.
- [x] e2e на локальный Postgres; фикстуры свечей удаляются в teardown. Swagger + `openapi:export`; в спеке все четыре GET: `/symbols`, `/symbols/:ticker`, `/candles`, `/candles/latest`.
