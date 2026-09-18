# 05: Backfill CLI — наполнить историю

**Parent:** `.scratch/b3-coingecko-cache-backfill/spec.md`

**What to build:** Оператор одной командой загружает историю Candle из Source в хранилище. Множество — `--all` (Active Symbol) или `--symbols` (только coingeckoId), `--days` обязателен и легален. Dry-run ничего не качает и не пишет. Resume добирает пустой CandleInterval. Один плохой id не отменяет остальных; CI видит exit 1. Повторный прогон без дублей.

**Blocked by:** 02 — Source Adapter

**Status:** ready-for-agent

- [ ] `--all` и `--symbols` вместе, или ни одного — ошибка CLI, без запросов к Source.
- [ ] Нет `--days` или N не из `1|7|14|30|90|180|365` — ошибка CLI, без округления.
- [ ] `--symbols` принимает только coingeckoId; Ticker (`BTC`) — строка error, не молчаливый маппинг.
- [ ] `--days=N` добирает интервалы: M30 всегда `1`; H4 = max `{7,14,30}` ≤ min(N,30); D4 только если N ∈ `{90,180,365}`.
- [ ] `--all` = все Active Symbol; запись `createMany` skipDuplicates чанками по 1000; concurrency по умолчанию 1 (последовательно).
- [ ] `--dry-run` не вызывает Source и не пишет; с `--resume` читает БД и показывает skip vs would-fetch.
- [ ] `--resume` пропускает пару Symbol+CandleInterval, у которой уже есть хотя бы одна Candle.
- [ ] Один Symbol 404 → остальные дорабатывают; отчёт (обработано / вставлено / пропущено / ошибки); exit 1 если была ошибка, 0 если все ок.
- [ ] Повторный прогон не увеличивает число Candle. Шов: application context + argv + nock + Postgres. Слой ROADMAP B3.
