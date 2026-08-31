/**
 * Модуль доступа к базе данных.
 *
 * @Global() — PrismaService доступен во ВСЕХ модулях без повторного import.
 * На B2/B3/B4 достаточно инжектить PrismaService в сервис или репозиторий:
 *   constructor(private prisma: PrismaService) {}
 *
 * Жизненный цикл подключения управляется в PrismaService (onModuleInit/Destroy).
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
