/**
 * Единственный слой, который видит Prisma-типы Candle и Symbol.
 * Карта файлов — candles.module.ts.
 *
 * Возвращает CandleRecord, не Swagger-DTO: HTTP-конверт собирает контроллер.
 * Ticker резолвится здесь (vsCurrency usd), без импорта SymbolsModule:
 * feature-модули независимы, PrismaModule @Global().
 *
 * Три входа с сервиса (тикеты 03–05):
 *   findSymbolIdByTicker — есть ли Symbol, в т.ч. неактивный, без фильтра isActive
 *   findHistory          — свечи пары symbolId+interval с окном; пусто → []
 *   findLatest           — Latest Candle той же пары (max openTime); пусто → null
 *
 * Ищем Symbol по паре ticker + vsCurrency: @@unique([ticker, vsCurrency]).
 * vsCurrency в MVP всегда usd (параметр в URL не принимаем).
 */
import { Injectable } from '@nestjs/common';
import { CandleInterval, type Candle as CandleRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CandleRecord } from './candle.record';

const VS_CURRENCY = 'usd';

/** Окно после defaults сервиса. Не путать с GetCandlesQueryDto (там from/to — ISO-строки). */
export type CandleHistoryWindow = {
  from?: Date;
  to?: Date;
  limit: number;
  /** true = нет дат: взять хвост (DESC+take), наружу всё равно ASC. */
  newestFirst: boolean;
};

@Injectable()
export class CandlesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Тикет 03: id Symbol по ticker + usd. Нет строки → null, isActive не смотрим. */
  async findSymbolIdByTicker(ticker: string): Promise<number | null> {
    const row = await this.prisma.symbol.findFirst({
      where: { ticker, vsCurrency: VS_CURRENCY },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Тикет 04: Prisma-запрос, не правила окна (их задал сервис в window).
   * gte/lte — inclusive openTime, как spec. Пусто → [].
   * newestFirst: ORDER BY DESC + take, затем reverse → JSON всегда ASC.
   * Индекс схемы @@index([symbolId, interval, openTime(sort: Desc)]) как раз для хвоста.
   */
  async findHistory(
    symbolId: number,
    interval: CandleInterval,
    window: CandleHistoryWindow,
  ): Promise<CandleRecord[]> {
    const openTime =
      window.from !== undefined || window.to !== undefined
        ? {
            ...(window.from !== undefined ? { gte: window.from } : {}),
            ...(window.to !== undefined ? { lte: window.to } : {}),
          }
        : undefined;
    const rows = await this.prisma.candle.findMany({
      where: {
        symbolId,
        interval,
        ...(openTime !== undefined ? { openTime } : {}),
      },
      orderBy: { openTime: window.newestFirst ? 'desc' : 'asc' },
      take: window.limit,
    });
    const chronological = window.newestFirst ? [...rows].reverse() : rows;
    return chronological.map((row) => this.toRecord(row));
  }

  /**
   * Тикет 05: Latest Candle пары symbolId+interval.
   * ORDER BY openTime DESC + findFirst — бар с наибольшим openTime.
   * Нет строк → null (сервис отличит от отсутствия Symbol).
   * Индекс @@index([symbolId, interval, openTime(sort: Desc)]) как раз для этого.
   */
  async findLatest(
    symbolId: number,
    interval: CandleInterval,
  ): Promise<CandleRecord | null> {
    const row = await this.prisma.candle.findFirst({
      where: { symbolId, interval },
      orderBy: { openTime: 'desc' },
    });
    return row === null ? null : this.toRecord(row);
  }

  /** Prisma-строка → domain. Decimal → string, чтобы JSON не округлил цены. */
  private toRecord(row: CandleRow): CandleRecord {
    return {
      openTime: row.openTime,
      open: row.open.toFixed(8),
      high: row.high.toFixed(8),
      low: row.low.toFixed(8),
      close: row.close.toFixed(8),
      volume: row.volume === null ? null : row.volume.toFixed(8),
    };
  }
}
