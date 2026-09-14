/**
 * Query GET /candles (тикет 03). Потребитель — CandlesController.getHistory (@Query()).
 * Не голый @Query() — иначе ValidationPipe не применит whitelist/forbidNonWhitelisted.
 * Карта файлов — ../candles.module.ts.
 *
 * Что сделал тикет 03 на входе: обязательные symbol и interval.
 * Лишнее поле → 400 (forbidNonWhitelisted). Чужой interval → 400 (@IsEnum).
 * @Transform toUpperCase — «btc» и «BTC» резолвятся в один Symbol.
 * from/to/limit появятся в тикете 04 — сейчас они лишние и тоже дадут 400.
 *
 * Примеры в @ApiProperty нужны /docs; в openapi.json query рисует
 * контроллер через явный @ApiQuery (tsx-export без swagger-плагина).
 */
import { ApiProperty } from '@nestjs/swagger';
import { CandleInterval } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class GetCandlesQueryDto {
  @ApiProperty({
    example: 'BTC',
    description: 'Ticker of the Symbol',
    type: String,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @ApiProperty({
    enum: CandleInterval,
    example: CandleInterval.H4,
    description: 'CandleInterval: M30, H4 or D4',
  })
  @IsEnum(CandleInterval)
  interval!: CandleInterval;
}
