/**
 * Внутренняя запись Candle: repository → service → controller (тикеты 03–05).
 *
 * Не путать с CandleDto: там openTime — ISO-строка для JSON,
 * здесь Date, как в Postgres (Timestamptz). Тикет 04 сравнивает Date по getTime()
 * (inclusive from/to). Тикет 05 не сравнивает: Latest — ORDER BY DESC в репозитории.
 * Цены уже string: Prisma Decimal не выходит из репозитория.
 * Карта файлов — candles.module.ts.
 */
export type CandleRecord = {
  openTime: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | null;
};
