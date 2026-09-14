/**
 * Внутренняя запись Candle: repository → service → controller (тикет 03).
 *
 * Не путать с CandleDto: там openTime — ISO-строка для JSON,
 * здесь Date, как в Postgres (Timestamptz). Цены уже string:
 * Prisma Decimal не выходит из репозитория.
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
