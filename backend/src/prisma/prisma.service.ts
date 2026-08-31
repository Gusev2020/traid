/**
 * Мост между NestJS и Prisma ORM.
 *
 * PrismaService extends PrismaClient — все методы ORM доступны:
 *   this.prisma.symbol.findMany()
 *   this.prisma.candle.upsert(...)
 *   this.prisma.user.create(...)
 *
 * Lifecycle-хуки Nest:
 *   onModuleInit    → $connect()  — открываем пул соединений при старте
 *   onModuleDestroy → $disconnect() — закрываем при остановке (SIGTERM)
 *
 * ping() — минимальный запрос SELECT 1 для health-check (не нагружает БД).
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /** Вызывается Nest автоматически после сборки всех модулей */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Вызывается при enableShutdownHooks() + SIGTERM/SIGINT */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Проверка «БД жива?» — используется PrismaHealthIndicator */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
