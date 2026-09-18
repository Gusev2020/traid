# Trading Dashboard

Словарь домена Treyd: исторические и live OHLC-данные по криптовалютам. Не spec и не описание Nest/Prisma.

## Language

**Symbol**:
Торговый инструмент, уникальный парой ticker + vsCurrency (в MVP vsCurrency всегда `usd`).
_Avoid_: coin, pair, asset, instrument, token

**Ticker**:
Короткий публичный код Symbol (`BTC`, `ETH`). Сам по себе не уникален — уникален вместе с vsCurrency.
_Avoid_: symbol (как строка запроса), id

**coingeckoId**:
Идентификатор Symbol у Source (`bitcoin`). Не Ticker: REST ищет по Ticker, Backfill `--symbols` — по coingeckoId.
_Avoid_: id, slug, coin id

**vsCurrency**:
Валюта котировки, в которой номинированы цены Symbol. В MVP всегда `usd`.
_Avoid_: quote, fiat, quote currency

**Active Symbol**:
Symbol, который показывается в списке по умолчанию и предназначен для Candle Sync. Неактивный Symbol всё ещё существует: его можно открыть по ticker, история Candle при этом не пропадает.
_Avoid_: enabled, listed, visible

**Candle**:
Один OHLC-бар Symbol на фиксированном CandleInterval с временем открытия `openTime`.
_Avoid_: bar, kline, candlestick, candle stick

**Volume**:
Оборот на Candle, если Source его знает. Если в данных пусто — значение неизвестно (`null`), а не ноль.
_Avoid_: amount, quantity, size

**CandleInterval**:
Допустимый таймфрейм бара: `M30`, `H4` или `D4`.
_Avoid_: timeframe, period, resolution, interval (как свободная строка)

**Latest Candle**:
Candle с наибольшим `openTime` для данной пары Symbol + CandleInterval. Отсутствие Latest Candle — не то же самое, что отсутствие Symbol.
_Avoid_: current candle, last price, ticker (как цена)

**Source**:
Внешний поставщик OHLC для Candle. В MVP это CoinGecko. PostgreSQL — хранилище истории, не Source.
_Avoid_: feed, provider, upstream, API (как имя источника)

**Candle Sync**:
Периодическое обновление Candle по Active Symbol из Source. Не путать с Backfill: Sync держит ряд свежим, а не наполняет историю по команде.
_Avoid_: refresh, poll, cron, scheduler

**Backfill**:
Загрузка истории Candle из Source в хранилище по явной команде оператора.
_Avoid_: import, seed (seed — про Symbol), crawl

**Stale**:
Признак, что история отдана из хранилища, пока Source недоступен. Пустой ряд без единого успешного Candle Sync — не Stale. Старые данные при живом Source — тоже не Stale.
_Avoid_: outdated, cached, expired
