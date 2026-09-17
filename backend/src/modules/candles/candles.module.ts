/**
 * Модуль истории Candle — слой B2, тикеты 03 (пустой конверт), 04 (окно), 05 (latest).
 *
 * Что сделал тикет 03: публичный GET /api/v1/candles. Клиент всегда получает
 * конверт { symbol, interval, items, stale } (§7.1), не голый массив.
 * Seed без свечей: известный Symbol → 200 и items: []. Нет Symbol → 404
 * SYMBOL_NOT_FOUND. Неактивный обслуживается. Плохой query → 400.
 * Ticker резолвится здесь (usd), SymbolsModule не импортируем.
 *
 * Что сделал тикет 04: optional from/to (ISO-8601, inclusive openTime),
 * limit 1..1000 default 500. Без дат — хвост из limit, ответ ASC.
 * from позже to → 400 INVALID_CANDLE_RANGE. Цены — string; Volume — string|null.
 *
 * Что сделал тикет 05: публичный GET /api/v1/candles/latest. 200 — один CandleDto.
 * Нет Symbol → 404 SYMBOL_NOT_FOUND. Нет бара → 404 CANDLE_NOT_FOUND.
 *
 * Шаблон: Controller → Service → Repository. Prisma не импортируется явно:
 * PrismaModule помечен @Global(), CandlesRepository получает PrismaService из DI.
 *
 * Как связаны файлы (запрос сверху вниз, JSON — снизу вверх):
 *
 *   query string  →  dto/get-candles-query.dto.ts         symbol+interval; from/to ISO; limit
 *   query latest  →  dto/get-latest-candle-query.dto.ts   только symbol+interval
 *   HTTP          →  candles.controller.ts                ISO → Date; Swagger; toDto()
 *   оркестрация   →  candles.service.ts                   окно; getLatest; stale=false
 *   Prisma        →  candles.repository.ts                ticker+usd; окно; findLatest DESC
 *   domain        →  candle.record.ts                     Date, цены string
 *   JSON бар      →  dto/candle.dto.ts                    элемент items и ответ latest
 *   JSON конверт  →  dto/candle-history.dto.ts            { symbol, interval, items, stale }
 *   регистрация   →  app.module.ts                        CandlesModule рядом с SymbolsModule
 *   404/400 code  →  common/errors/domain.error.ts        SYMBOL_NOT_FOUND, CANDLE_NOT_FOUND
 *   HTTP-статус   →  common/filters/all-exceptions.filter.ts  code → 404 / 400
 *   unit          →  candles.service.spec.ts              окно на полном моке репозитория
 *   e2e           →  test/candles.e2e-spec.ts             фикстуры Candle; afterEach только их
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
