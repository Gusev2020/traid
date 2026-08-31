/**
 * Контроллер health-check.
 *
 * Цепочка при GET /health:
 *   1. Nest маршрутизирует запрос сюда (путь /health, не /api/v1/health)
 *   2. @HealthCheck() декоратор форматирует ответ Terminus
 *   3. HealthCheckService.check() запускает массив индикаторов параллельно
 *   4. Каждый индикатор возвращает { key: { status: 'up' | 'down' } }
 *   5. Если хотя бы один 'down' → HTTP 503, иначе HTTP 200 { status: 'ok' }
 */
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Индикатор 1: Postgres доступен? (SELECT 1 с таймаутом 1.5 сек)
      () => this.prismaIndicator.pingCheck('database', { timeout: 1500 }),

      // Индикатор 2: heap памяти Node.js < 300 МБ?
      // Если процесс «течёт» — health упадёт, оркестратор перезапустит pod.
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}
