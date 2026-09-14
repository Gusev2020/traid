/**
 * JSON-конверт GET /candles (тикет 03). Канон — ARCHITECTURE §7.1, не sequence §4.2:
 * { symbol, interval, items, stale }, не голый массив.
 * Карта файлов — ../candles.module.ts.
 *
 * Собирает контроллер: items = CandleRecord[] через toDto() → CandleDto;
 * symbol/interval/stale приходят из CandlesService (stale в B2 всегда false).
 * type задаём явно: openapi:export через tsx без emitDecoratorMetadata.
 */
import { ApiProperty } from '@nestjs/swagger';
import { CandleInterval } from '@prisma/client';
import { CandleDto } from './candle.dto';

export class CandleHistoryDto {
  @ApiProperty({ example: 'BTC', type: String })
  symbol!: string;

  @ApiProperty({ enum: CandleInterval, example: CandleInterval.H4 })
  interval!: CandleInterval;

  @ApiProperty({
    type: [CandleDto],
    example: [],
  })
  items!: CandleDto[];

  @ApiProperty({ example: false, type: Boolean })
  stale!: boolean;
}
