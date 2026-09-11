/**
 * Внутренняя запись Symbol между repository и controller.
 *
 * Не путать с SymbolDto: там lastSyncedAt — ISO-строка для JSON,
 * здесь Date | null, как в Postgres (Timestamptz).
 * Prisma-модель сюда не протекается (нет id, createdAt).
 */
export type SymbolRecord = {
  ticker: string;
  name: string;
  coingeckoId: string;
  vsCurrency: string;
  isActive: boolean;
  lastSyncedAt: Date | null;
};
