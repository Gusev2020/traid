/**
 * Модуль health-check — проверка «приложение готово принимать трафик?»
 *
 * Используется:
 *   - Docker HEALTHCHECK
 *   - Kubernetes liveness/readiness probe
 *   - Load balancer (убирает мёртвый инстанс из ротации)
 *
 * Эндпоинт: GET /health (БЕЗ префикса /api/v1 — см. app.setup.ts)
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma-health.indicator';

@Module({
  imports: [TerminusModule], // HealthCheckService, MemoryHealthIndicator и др.
  controllers: [HealthController],
  providers: [PrismaHealthIndicator], // наш кастомный индикатор для Postgres
})
export class HealthModule {}
