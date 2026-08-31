/**
 * Кастомный health-индикатор для PostgreSQL через Prisma.
 *
 * Terminus предоставляет базовый класс HealthIndicator и метод getStatus().
 * Мы расширяем его, чтобы проверить именно нашу БД (не generic HTTP ping).
 *
 * Promise.race — если Postgres завис, ping не будет ждать вечно:
 *   либо SELECT 1 успеет за 1.5 сек, либо reject с 'database ping timeout'.
 */
import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(
    key: string,
    options: { timeout?: number } = {},
  ): Promise<HealthIndicatorResult> {
    const timeout = options.timeout ?? 1500;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.prisma.ping(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('database ping timeout')),
            timeout,
          );
        }),
      ]);
      return this.getStatus(key, true);
    } catch (error) {
      // HealthCheckError — Terminus превращает это в HTTP 503 с деталями
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, {
          message: error instanceof Error ? error.message : 'unknown',
        }),
      );
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
