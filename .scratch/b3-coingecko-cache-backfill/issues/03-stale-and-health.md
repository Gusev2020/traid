# 03: Stale на GET + Source на /health

**Parent:** `.scratch/b3-coingecko-cache-backfill/spec.md`

**What to build:** История Candle по-прежнему читается только из PostgreSQL. Когда Source недоступен (breaker open), `GET /candles` отдаёт 200, items из БД и `stale: true`. Пустой ряд или живой Source — `stale: false`. `/health` при падении Source остаётся 200, в details — degraded. GET в Source не ходит и не отдаёт 503.

**Blocked by:** 02 — Source Adapter

**Status:** ready-for-agent

- [ ] Breaker open → `GET /api/v1/candles` 200, items из хранилища, `stale: true`.
- [ ] Breaker closed и не было успешного Candle Sync → 200, `items: []` (если ряда нет), `stale: false`.
- [ ] Старые Candle при живом Source → `stale: false`.
- [ ] `GET /candles/latest` без поля `stale`; по-прежнему не вызывает Source.
- [ ] `GET /health` → 200 при живой БД и open breaker; Source в details как degraded, не критичный.
- [ ] 404 на одном coingeckoId breaker не открывает и Stale на всю историю не ставит.
- [ ] `openapi:export` после смены смысла `stale` и кодов.
- [ ] Эндпоинты публичные. Слой ROADMAP B3. Шов: HTTP e2e + nock (тик cron не обязателен: breaker можно открыть через фасад).
