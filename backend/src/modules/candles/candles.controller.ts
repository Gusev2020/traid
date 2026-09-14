/**
 * HTTP-слой Candle. Без Prisma и без бизнес-логики.
 * Соседи: GetCandlesQueryDto (вход), CandlesService (данные),
 * CandleHistoryDto / CandleDto (выход). Карта файлов — candles.module.ts.
 *
 * Цепочка при GET /api/v1/candles (тикет 03):
 *   1. ValidationPipe валидирует query через GetCandlesQueryDto
 *      (лишние поля → 400, interval не M30|H4|D4 → 400, ticker → UPPER)
 *   2. CandlesService резолвит Symbol в репозитории свечей (usd);
 *      нет строки → SymbolNotFoundError → AllExceptionsFilter → 404
 *   3. toDto() на каждый CandleRecord → items; stale уже false
 *   4. 200 + CandleHistoryDto { symbol, interval, items, stale } — канон §7.1
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

  /** Тикет 03: конверт истории. Query уже валиден; наружу Record → CandleDto. */
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
  @ApiOkResponse({ type: CandleHistoryDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getHistory(
    @Query() query: GetCandlesQueryDto,
  ): Promise<CandleHistoryDto> {
    const history = await this.candles.getHistory({
      symbol: query.symbol,
      interval: query.interval,
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
