/**
 * Сборка Candle Sync (тикет 04). HTTP-роутов здесь нет.
 *
 * ScheduleModule.forRoot() даёт реестр таймеров. Интервал берём из env
 * числом миллисекунд, поэтому это не cron-строка, а setInterval.
 * CoinGeckoModule отдаёт адаптер: «скачай свечи». В базу адаптер не пишет.
 * Модуль подключён в AppModule — иначе тик в процессе не запустится.
 */
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoinGeckoModule } from '../../integrations/coingecko/coingecko.module';
import { CandleSyncRepository } from './candle-sync.repository';
import { CandleSyncScheduler } from './candle-sync.scheduler';

@Module({
  imports: [ScheduleModule.forRoot(), CoinGeckoModule],
  providers: [CandleSyncRepository, CandleSyncScheduler],
})
export class CandleSyncModule {}
