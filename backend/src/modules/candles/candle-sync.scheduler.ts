/**
 * Планировщик Candle Sync (тикет 04).
 *
 * GET /candles только читает базу и не ходит в CoinGecko.
 * Свежие бары сюда кладёт этот класс: раз в минуту скачивает OHLC
 * и просит репозиторий записать их.
 *
 * tick() — одна волна по всем Active Symbol. Пока она не кончилась,
 * следующий вызов сразу выходит и вторую волну запросов не шлёт.
 * Ошибка одного Symbol не останавливает остальных.
 *
 * В тестах таймер не ставим: e2e сам вызывает tick(), иначе результат
 * зависел бы от того, успел ли интервал сработать.
 * days 1, 30 и 365 — три графика: 30 минут, 4 часа и 4 дня.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  CoinGeckoAdapter,
  SourceCandle,
} from '../../integrations/coingecko/coingecko.adapter';
import {
  CandleSyncRepository,
  CandleSyncTarget,
} from './candle-sync.repository';

const SYNC_INTERVAL_NAME = 'candle-sync';
const SYNC_DAYS = [1, 30, 365] as const;

@Injectable()
export class CandleSyncScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CandleSyncScheduler.name);
  private running = false;
  private scheduled = false;

  constructor(
    // @Inject написан явно: openapi:export запускается через tsx,
    // а tsx не сохраняет типы аргументов конструктора. Без токена Nest
    // не понимает, что сюда передать, и выгрузка спеки падает.
    @Inject(CandleSyncRepository)
    private readonly repository: CandleSyncRepository,
    @Inject(CoinGeckoAdapter)
    private readonly source: CoinGeckoAdapter,
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    // В jest таймер выключен. Тест вызывает tick() сам.
    if (process.env.NODE_ENV === 'test') return;
    const intervalMs = this.config.getOrThrow<number>(
      'coingecko.syncIntervalMs',
    );
    // Первый тик будет после intervalMs: запуск приложения не ждёт загрузки Source.
    const interval = setInterval(() => void this.tick(), intervalMs);
    this.schedulerRegistry.addInterval(SYNC_INTERVAL_NAME, interval);
    this.scheduled = true;
  }

  onModuleDestroy(): void {
    if (this.scheduled) {
      this.schedulerRegistry.deleteInterval(SYNC_INTERVAL_NAME);
      this.scheduled = false;
    }
  }

  /**
   * Одна полная волна. Повторный вызов, пока running === true, ничего не качает.
   * Флаг ставим до первого await: второй tick() видит его сразу, без гонки.
   */
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.debug('Candle Sync tick skipped: previous tick is running');
      return;
    }
    this.running = true;
    try {
      const targets = await this.repository.listTargets();
      // Последовательная загрузка не создаёт всплеск запросов на каждый Symbol.
      for (const target of targets) {
        try {
          await this.syncSymbol(target);
          this.logger.log(`Candle Sync completed for ${target.coingeckoId}`);
        } catch (error) {
          // Ошибка изолирована одним Symbol: остальные инструменты ещё можно обновить.
          this.logger.warn(
            `Candle Sync failed for ${target.coingeckoId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } finally {
      // Освобождаем тик и при ошибке БД, чтобы следующие запуски могли повторить попытку.
      this.running = false;
    }
  }

  private async syncSymbol(target: CandleSyncTarget): Promise<void> {
    // Сначала собираем все три интервала в памяти. При сбое одного из них
    // ничего для этого Symbol не записываем и lastSyncedAt не сдвигаем.
    const candles: SourceCandle[] = [];
    for (const days of SYNC_DAYS) {
      const intervalCandles = await this.source.getOhlc({
        coingeckoId: target.coingeckoId,
        vsCurrency: target.vsCurrency,
        days,
      });
      // Пустой ответ — не успех. saveSymbol ниже не вызовется, lastSyncedAt останется.
      if (intervalCandles.length === 0) {
        throw new Error(`Source returned no candles for days=${days}`);
      }
      candles.push(...intervalCandles);
    }
    await this.repository.saveSymbol(target.id, candles);
  }
}
