/**
 * Модуль истории Candle — слой B2, тикет 03 (пустой конверт).
 *
 * Что сделал тикет 03: публичный GET /api/v1/candles. Клиент всегда получает
 * конверт { symbol, interval, items, stale } (§7.1), не голый массив.
 * Seed без свечей: известный Symbol → 200 и items: []. Нет Symbol → 404
 * SYMBOL_NOT_FOUND. Неактивный обслуживается. Плохой query → 400.
 * Ticker резолвится здесь (usd), SymbolsModule не импортируем.
 *
 * Шаблон: Controller → Service → Repository. Prisma не импортируется явно:
 * PrismaModule помечен @Global(), CandlesRepository получает PrismaService из DI.
 *
 * Как связаны файлы (запрос сверху вниз, JSON — снизу вверх):
 *
 *   query string  →  dto/get-candles-query.dto.ts  symbol+interval, UPPER, enum
 *   HTTP          →  candles.controller.ts         маршрут, Swagger 200/400/404, toDto()
 *   оркестрация   →  candles.service.ts            нет Symbol → ошибка; stale=false
 *   Prisma        →  candles.repository.ts         ticker+usd; findHistory (пока без окна)
 *   domain        →  candle.record.ts              Date, цены string, без Prisma.Decimal
 *   JSON бар      →  dto/candle.dto.ts             элемент items, openTime — ISO-строка
 *   JSON конверт  →  dto/candle-history.dto.ts     { symbol, interval, items, stale }
 *   регистрация   →  app.module.ts                 CandlesModule рядом с SymbolsModule
 *   404 code      →  common/errors/domain.error.ts SymbolNotFoundError
 *   unit          →  candles.service.spec.ts       пустая история → [] (не not-found)
 *   e2e           →  test/candles.e2e-spec.ts      200/400/404 на живой Postgres
 *
 * from/to/limit — тикет 04. GET /candles/latest — тикет 05.
 */
import { Module } from '@nestjs/common';
import { CandlesController } from './candles.controller';
import { CandlesRepository } from './candles.repository';
import { CandlesService } from './candles.service';

@Module({
  controllers: [CandlesController],
  providers: [CandlesService, CandlesRepository],
})
export class CandlesModule {}
