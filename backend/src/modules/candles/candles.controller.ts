/**
 * HTTP-слой Candle. Без Prisma и без бизнес-логики.
 * Соседи: GetCandlesQueryDto (вход), CandlesService (данные),
 * CandleHistoryDto / CandleDto (выход). Карта файлов — candles.module.ts.
 *
 * Цепочка при GET /api/v1/candles (тикеты 03–04):
 *   1. ValidationPipe валидирует query через GetCandlesQueryDto
 *      (лишние поля → 400, interval не M30|H4|D4 → 400, ticker → UPPER,
 *       from/to ISO-8601, limit 1..1000)
 *   2. ISO-строки from/to → Date здесь; HTTP не утекает в сервис
 *   3. CandlesService резолвит Symbol в репозитории свечей (usd);
 *      нет строки → SymbolNotFoundError → AllExceptionsFilter → 404
 *      from позже to → InvalidCandleRangeError → 400
 *   4. toDto() на каждый CandleRecord → items; stale уже false
 *   5. 200 + CandleHistoryDto { symbol, interval, items, stale } — канон §7.1
 *
 * JWT нет до B4: роут открыт так же, как /health. @Public() появится вместе с guard.
 * @ApiQuery явно: openapi:export идёт через tsx без swagger-плагина.
 */
import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CandleInterval } from '@prisma/client';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { CandleRecord } from './candle.record';
import { CandlesService } from './candles.service';
import { CandleDto } from './dto/candle.dto';
import { CandleHistoryDto } from './dto/candle-history.dto';
import { GetCandlesQueryDto } from './dto/get-candles-query.dto';

@ApiTags('candles')
@Controller('candles')
export class CandlesController {
  constructor(private readonly candles: CandlesService) {}

  /** Тикеты 03–04: конверт истории. Query уже валиден; наружу Record → CandleDto. */
  @Get()
  @ApiOperation({ summary: 'Get Candle history' })
  @ApiQuery({
    name: 'symbol',
    required: true,
    type: String,
    example: 'BTC',
    description: 'Ticker of the Symbol',
  })
  @ApiQuery({
    name: 'interval',
    required: true,
    enum: CandleInterval,
    example: CandleInterval.H4,
    description: 'CandleInterval: M30, H4 or D4',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-01-01T00:00:00.000Z',
    description: 'Inclusive openTime lower bound (ISO-8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-01-01T12:00:00.000Z',
    description: 'Inclusive openTime upper bound (ISO-8601)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 500,
    schema: {
      type: 'integer',
      default: 500,
      minimum: 1,
      maximum: 1000,
      example: 500,
    },
  })
  @ApiOkResponse({ type: CandleHistoryDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getHistory(
    @Query() query: GetCandlesQueryDto,
  ): Promise<CandleHistoryDto> {
    // from/to в DTO — ISO-строки; сервис сравнивает Date, HTTP здесь заканчивается.
    const history = await this.candles.getHistory({
      symbol: query.symbol,
      interval: query.interval,
      from: query.from !== undefined ? new Date(query.from) : undefined,
      to: query.to !== undefined ? new Date(query.to) : undefined,
      limit: query.limit,
    });
    return {
      symbol: history.symbol,
      interval: history.interval,
      items: history.items.map((candle) => this.toDto(candle)),
      stale: history.stale,
    };
  }

  /** Domain → HTTP: openTime сериализуем строкой, цены уже string в Record. */
  private toDto(candle: CandleRecord): CandleDto {
    return {
      openTime: candle.openTime.toISOString(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    };
  }
}
