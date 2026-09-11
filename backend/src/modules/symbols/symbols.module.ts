/**
 * Модуль торговых инструментов (Symbol) — слой B2.
 *
 * Шаблон feature-модуля: Controller → Service → Repository.
 * Prisma не импортируется явно: PrismaModule помечен @Global(),
 * поэтому SymbolsRepository получает PrismaService через DI.
 *
 * Эндпоинт этого тикета: GET /api/v1/symbols/:ticker
 * Список GET /symbols и модуль свечей появятся в следующих тикетах B2.
 */
import { Module } from '@nestjs/common';
import { SymbolsController } from './symbols.controller';
import { SymbolsRepository } from './symbols.repository';
import { SymbolsService } from './symbols.service';

@Module({
  controllers: [SymbolsController],
  providers: [SymbolsService, SymbolsRepository],
})
export class SymbolsModule {}
