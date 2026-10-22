/**
 * Unit-тест HealthController.
 *
 * Зависимости (HealthCheckService, индикаторы) подменены моками.
 * Проверяем только контроллер: он передаёт в check три индикатора —
 * база, CoinGecko, память. Сам breaker здесь не открываем, это делает e2e.
 */
import { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma-health.indicator';
import { SourceHealthIndicator } from './source-health.indicator';

describe('HealthController', () => {
  const prismaIndicator = {
    pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
  };
  const memory = {
    checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }),
  };
  const sourceIndicator = {
    isHealthy: jest
      .fn()
      .mockReturnValue({ coingecko: { status: 'up', state: 'up' } }),
  };
  let indicators: Array<() => unknown> = [];
  const health = {
    check: jest.fn((fns: Array<() => unknown>) => {
      indicators = fns;
      return Promise.resolve({ status: 'ok' });
    }),
  };

  const controller = new HealthController(
    health as unknown as HealthCheckService,
    prismaIndicator as unknown as PrismaHealthIndicator,
    memory as unknown as MemoryHealthIndicator,
    sourceIndicator as unknown as SourceHealthIndicator,
  );

  it('runs database, source, and memory indicators', async () => {
    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(health.check).toHaveBeenCalledTimes(1);
    expect(indicators).toHaveLength(3);

    // Выполняем функции-индикаторы, которые передал контроллер
    await Promise.all(indicators.map((fn) => fn()));
    expect(prismaIndicator.pingCheck).toHaveBeenCalledWith('database', {
      timeout: 1500,
    });
    expect(memory.checkHeap).toHaveBeenCalledWith(
      'memory_heap',
      300 * 1024 * 1024,
    );
    expect(sourceIndicator.isHealthy).toHaveBeenCalledWith('coingecko');
  });
});
