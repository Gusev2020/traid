# 02: Source Adapter — OHLC → Candle[]

**Parent:** `.scratch/b3-coingecko-cache-backfill/spec.md`

**What to build:** По coingeckoId, vsCurrency `usd` и легальному `days` фасад Source отдаёт массив Candle: Volume `null`, битый payload не проходит. Параллельные вызовы одного ключа делят один HTTP-запрос; квота и breaker держат Demo-план. В БД и в GET этот тикет не пишет. Живой хост CoinGecko в тестах запрещён.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Adapter: `[ts, open, high, low, close]` → Candle, Volume всегда `null`; `days` 1 → M30, 2–30 → H4, ≥31 → D4.
- [ ] Zod: невалидный ответ целиком отвергается, частичной «записи» нет.
- [ ] Client: timeout 8s; retry 3× backoff+jitter только на 429/5xx/сеть; 4xx (кроме 429) без retry; `Retry-After` ждётся, счётчик retry не растёт; header Demo API key.
- [ ] Token bucket 50/min: при исчерпании ожидание, не отказ.
- [ ] Cache TTL 60s, ключ `ohlc:{coingeckoId}:{vsCurrency}:{days}`, single-flight: 10 параллельных вызовов одного ключа → 1 HTTP (nock).
- [ ] Breaker: 5 ошибок подряд (timeout, сеть, 5xx, 429 после retry, Zod) → open 60s; 4xx кроме 429 не считаются; half-open — один probe.
- [ ] Env Source валидируется на старте; пустой API key допустим.
- [ ] Интеграционный слой не ходит в БД. Шов: фасад Adapter + nock, без отдельных сюит на Client/Cache.
- [ ] Слой ROADMAP B3.
