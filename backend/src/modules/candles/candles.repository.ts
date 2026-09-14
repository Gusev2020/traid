/**
 * Единственный слой, который видит Prisma-типы Candle и Symbol.
 * Карта файлов — candles.module.ts.
 *
 * Возвращает CandleRecord, не Swagger-DTO: HTTP-конверт собирает контроллер.
 * Ticker резолвится здесь (vsCurrency usd), без импорта SymbolsModule:
 * feature-модули независимы, PrismaModule @Global().
 *
 * Два входа с сервиса (тикет 03):
 *   findSymbolIdByTicker — есть ли Symbol, в т.ч. неактивный, без фильтра isActive
 *   findHistory          — свечи пары symbolId+interval; пусто → []; окно — тикет 04
 *
 * Ищем Symbol по паре ticker + vsCurrency: @@unique([ticker, vsCurrency]).
 * vsCurrency в MVP всегда usd (параметр в URL не принимаем).
 */
import { Injectable } from '@nestjs/common';
import { CandleInterval, type Candle as CandleRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CandleRecord } from './candle.record';

const VS_CURRENCY = 'usd';

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

  /** Тикет 03: все свечи пары, ASC по openTime. Пусто → []. from/to/limit — тикет 04. */
  async findHistory(
    symbolId: number,
    interval: CandleInterval,
  ): Promise<CandleRecord[]> {
    const rows = await this.prisma.candle.findMany({
      where: { symbolId, interval },
      orderBy: { openTime: 'asc' },
    });
    return rows.map((row) => this.toRecord(row));
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
