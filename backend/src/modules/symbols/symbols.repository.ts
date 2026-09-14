/**
 * Единственный слой, который видит Prisma-типы Symbol.
 *
 * Возвращает SymbolRecord (без id/createdAt), не Swagger-DTO:
 * HTTP-контракт собирает контроллер из Record. Два входа с сервиса:
 *   findByTicker — тикет 01, карточка, без фильтра isActive
 *   findPage     — тикет 02, страница + count по тем же фильтрам
 *
 * Ищем по паре ticker + vsCurrency: уникальность в схеме —
 * @@unique([ticker, vsCurrency]), не ticker один.
 * vsCurrency в MVP всегда usd (параметр в URL не принимаем).
 */
import { Injectable } from '@nestjs/common';
import { Prisma, type Symbol as SymbolRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SymbolRecord } from './symbol.record';

const VS_CURRENCY = 'usd';

/** Вход findPage после defaults сервиса. Не путать с ListSymbolsQueryDto (HTTP). */
export type SymbolListQuery = {
  search?: string;
  isActive: boolean;
  limit: number;
  offset: number;
};

@Injectable()
export class SymbolsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTicker(ticker: string): Promise<SymbolRecord | null> {
    const row = await this.prisma.symbol.findFirst({
      where: { ticker, vsCurrency: VS_CURRENCY },
    });
    return row ? this.toRecord(row) : null;
  }

  /**
   * Тикет 02: items текущей страницы и total после фильтров.
   * $transaction — один снимок для findMany и count.
   * orderBy ticker: без стабильного ORDER BY offset в Postgres не страница.
   */
  async findPage(
    query: SymbolListQuery,
  ): Promise<{ items: SymbolRecord[]; total: number }> {
    const where = this.listWhere(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.symbol.findMany({
        where,
        orderBy: { ticker: 'asc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.symbol.count({ where }),
    ]);
    return { items: rows.map((row) => this.toRecord(row)), total };
  }

  /** vsCurrency=usd + isActive; search — contains по ticker ИЛИ name, без регистра. */
  private listWhere(query: SymbolListQuery): Prisma.SymbolWhereInput {
    const where: Prisma.SymbolWhereInput = {
      vsCurrency: VS_CURRENCY,
      isActive: query.isActive,
    };
    if (query.search) {
      where.OR = [
        { ticker: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
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
