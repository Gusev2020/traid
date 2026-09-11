/**
 * Единственный слой, который видит Prisma-типы Symbol.
 *
 * Возвращает SymbolRecord (без id/createdAt), не Swagger-DTO:
 * HTTP-контракт собирает контроллер. Ищем по паре ticker + vsCurrency,
 * потому что уникальность в схеме — @@unique([ticker, vsCurrency]), не ticker один.
 *
 * vsCurrency в MVP всегда usd (параметр в URL не принимаем).
 */
import { Injectable } from '@nestjs/common';
import type { Symbol as SymbolRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SymbolRecord } from './symbol.record';

const VS_CURRENCY = 'usd';

@Injectable()
export class SymbolsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTicker(ticker: string): Promise<SymbolRecord | null> {
    const row = await this.prisma.symbol.findFirst({
      where: { ticker, vsCurrency: VS_CURRENCY },
    });
    return row ? this.toRecord(row) : null;
  }

  /** Prisma-строка → domain. id и createdAt наружу не отдаём. */
  private toRecord(row: SymbolRow): SymbolRecord {
    return {
      ticker: row.ticker,
      name: row.name,
      coingeckoId: row.coingeckoId,
      vsCurrency: row.vsCurrency,
      isActive: row.isActive,
      lastSyncedAt: row.lastSyncedAt,
    };
  }
}
