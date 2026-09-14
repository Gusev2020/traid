/**
 * Модуль торговых инструментов (Symbol) — слой B2.
 *
 * Склеивает тикеты 01 (карточка по ticker) и 02 (список с поиском и страницей).
 * Шаблон: Controller → Service → Repository. Prisma не импортируется явно:
 * PrismaModule помечен @Global(), SymbolsRepository получает PrismaService из DI.
 *
 * Как связаны файлы (запрос сверху вниз, JSON — снизу вверх):
 *
 *   query string  →  dto/list-symbols-query.dto.ts   whitelist, limit/offset, active
 *   path :ticker  →  dto/symbol-ticker-param.dto.ts  toUpperCase (тикет 01)
 *   HTTP          →  symbols.controller.ts           маршруты, Swagger, toDto()
 *   оркестрация   →  symbols.service.ts              defaults списка; 404 карточки
 *   Prisma        →  symbols.repository.ts           findByTicker / findPage
 *   domain        →  symbol.record.ts                Date, без id/createdAt
 *   JSON карточка →  dto/symbol.dto.ts               lastSyncedAt — ISO-строка
 *   JSON страница →  dto/symbol-list.dto.ts          { items: SymbolDto[], total }
 *
 * Эндпоинты: GET /api/v1/symbols и GET /api/v1/symbols/:ticker.
 * История свечей — CandlesModule (тикет 03), без импорта отсюда.
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
