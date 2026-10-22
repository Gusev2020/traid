/**
 * Запись результата Candle Sync в Postgres.
 *
 * Планировщик сюда не лезет SQL-ом: он просит listTargets и saveSymbol.
 * listTargets — кого обновлять. Сейчас это все Active Symbol.
 * Наличие WebSocket-подписчиков на выбор Symbol в B3 не влияет.
 *
 * saveSymbol пишет все свечи символа и lastSyncedAt одной транзакцией.
 * Upsert по ключу (symbol + interval + openTime): повторный тик меняет
 * цены уже открытой свечи и не создаёт вторую строку.
 * Если один из трёх интервалов не скачался, saveSymbol не вызывают —
 * timestamp не сдвинется, пока ряд неполный.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SourceCandle } from '../../integrations/coingecko/coingecko.adapter';

export type CandleSyncTarget = {
  id: number;
  coingeckoId: string;
  vsCurrency: string;
};

@Injectable()
export class CandleSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Кого синхронизировать в этом тике. Порядок по id — тик предсказуемый. */
  listTargets(): Promise<CandleSyncTarget[]> {
    return this.prisma.symbol.findMany({
      where: { isActive: true },
      select: { id: true, coingeckoId: true, vsCurrency: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Свечи и lastSyncedAt коммитятся вместе.
   * Таймаут 30 с: за три горизонта Source отдаёт сотни баров, стандартных 5 с мало.
   */
  async saveSymbol(symbolId: number, candles: SourceCandle[]): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        for (const candle of candles) {
          const prices = {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          };
          await tx.candle.upsert({
            where: {
              symbolId_interval_openTime: {
                symbolId,
                interval: candle.interval,
                openTime: candle.openTime,
              },
            },
            create: {
              symbolId,
              interval: candle.interval,
              openTime: candle.openTime,
              ...prices,
            },
            update: prices,
          });
        }
        // Метка означает успешную запись полного набора интервалов.
        // Если upsert или обновление метки падает, транзакция откатывает все записи.
        await tx.symbol.update({
          where: { id: symbolId },
          data: { lastSyncedAt: new Date() },
        });
      },
      { timeout: 30_000 },
    );
  }
}
