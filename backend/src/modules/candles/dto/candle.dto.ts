/**
 * JSON-бар Candle для клиента и для Swagger / OpenAPI.
 * Карта файлов — ../candles.module.ts.
 *
 * Элемент items — GET /candles (тикет 03, CandleHistoryDto). В тикете 03
 * items всегда [] (seed без свечей); форма бара нужна, чтобы конверт
 * совпал с §7.1. Один бар — GET /candles/latest (тикет 05).
 *
 * Денежные Decimal наружу — string; Volume всегда в объекте: string или null
 * (пусто источника ≠ ноль). type задаём явно: openapi:export через tsx
 * без emitDecoratorMetadata.
 */
import { ApiProperty } from '@nestjs/swagger';

export class CandleDto {
  @ApiProperty({ example: '2026-08-28T12:00:00.000Z', type: String })
  openTime!: string;

  @ApiProperty({ example: '64250.10000000', type: String })
  open!: string;

  @ApiProperty({ example: '64980.55000000', type: String })
  high!: string;

  @ApiProperty({ example: '64100.00000000', type: String })
  low!: string;

  @ApiProperty({ example: '64870.25000000', type: String })
  close!: string;

  @ApiProperty({
    example: '1245.33000000',
    type: String,
    nullable: true,
  })
  volume!: string | null;
}
