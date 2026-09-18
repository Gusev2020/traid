# 04: Candle Sync — тик Active Symbol

**Parent:** `.scratch/b3-coingecko-cache-backfill/spec.md`

**What to build:** Раз в минуту (env) система обновляет Candle всех Active Symbol на M30, H4 и D4 через канон Source `days` 1/30/365. Latest Candle живая (upsert). Неактивный Symbol квоту не тратит. Пока тик не закончился, следующий skip. `lastSyncedAt` — только если все три CandleInterval этого Symbol в тике записались. В B4 сменится источник множества, не ритм.

**Blocked by:** 02 — Source Adapter

**Status:** ready-for-agent

- [ ] Один явный тик (cron в тестах выключен) для Active Symbol запрашивает `days` 1, 30 и 365 и upsert по PK.
- [ ] Повторный тик меняет OHLC уже существующего Latest Candle, не плодит дубли.
- [ ] Неактивный Symbol в тике не запрашивается и не пишется.
- [ ] Пока тик in-flight, следующий вызов skip, без второй волны к Source.
- [ ] `lastSyncedAt` обновляется только после успеха всех трёх интервалов; частичный провал (в т.ч. 404 id) timestamp не двигает.
- [ ] Множество B3 = все Active Symbol; подписчики WS не вводятся.
- [ ] GET после успешного тика видит новые/обновлённые Candle из БД, сам в Source не ходит.
- [ ] Шов: HTTP e2e + nock, живой Postgres, seed Symbol не truncate. Слой ROADMAP B3.
