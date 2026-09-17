/**
 * Query GET /candles/latest (тикет 05). Потребитель — CandlesController.getLatest.
 * Не голый @Query() — иначе ValidationPipe не применит whitelist/forbidNonWhitelisted.
 * Карта файлов — ../candles.module.ts.
 *
 * Отдельный DTO, не GetCandlesQueryDto: from/to/limit на latest — лишние
 * поля → 400 (whitelist). История их принимает, latest — нет.
 * @Transform toUpperCase — «btc» и «BTC» резолвятся в один Symbol.
 *
 * Примеры в @ApiProperty нужны /docs; в openapi.json query рисует
 * контроллер через явный @ApiQuery (tsx-export без swagger-плагина).
 */
import { ApiProperty } from '@nestjs/swagger';
import { CandleInterval } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class GetLatestCandleQueryDto {
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
