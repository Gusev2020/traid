/**
 * Модуль health-check — проверка «приложение готово принимать трафик?»
 *
 * Используется:
 *   - Docker HEALTHCHECK
 *   - Kubernetes liveness/readiness probe
 *   - Load balancer (убирает мёртвый инстанс из ротации)
 *
 * Эндпоинт: GET /health (БЕЗ префикса /api/v1 — см. app.setup.ts).
 * Throttler пропускается (@SkipThrottle) — probe жив при флуде публичного API.
 *
 * B3 тикет 03: рядом с базой и памятью стоит SourceHealthIndicator.
 * CoinGeckoModule подключён, чтобы индикатор видел тот же адаптер, что и синхронизация.
 * Открытый breaker не роняет /health в 503: процесс жив, данные читаются из Postgres.
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CoinGeckoModule } from '../../integrations/coingecko/coingecko.module';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma-health.indicator';
import { SourceHealthIndicator } from './source-health.indicator';

@Module({
  imports: [TerminusModule, CoinGeckoModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, SourceHealthIndicator],
})
export class HealthModule {}
