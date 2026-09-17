/**
 * Query GET /candles (тикеты 03–04). Потребитель — CandlesController.getHistory (@Query()).
 * Не голый @Query() — иначе ValidationPipe не применит whitelist/forbidNonWhitelisted.
 * Карта файлов — ../candles.module.ts.
 *
 * Тикет 03: обязательные symbol и interval. Лишнее поле → 400.
 * Тикет 04: optional from/to (ISO-8601), limit 1..1000 default 500.
 * from позже to режет сервис (InvalidCandleRangeError), не этот DTO.
 * @Transform toUpperCase — «btc» и «BTC» резолвятся в один Symbol.
 *
 * from/to оставляем string + @IsISO8601: transform в Date сломал бы ISO-валидатор
 * (ValidationPipe гоняет class-transformer до class-validator).
 *
 * Примеры в @ApiProperty нужны /docs; в openapi.json query рисует
 * контроллер через явный @ApiQuery (tsx-export без swagger-плагина).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandleInterval } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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

  // Тикет 04: optional, не Date. Контроллер парсит new Date() после pipe.
  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Inclusive openTime lower bound (ISO-8601)',
    type: String,
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-01-01T12:00:00.000Z',
    description: 'Inclusive openTime upper bound (ISO-8601)',
    type: String,
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  // Query приходит строкой; без @Type Min/Max увидят "500" и дадут 400.
  // Default 500 дублируется в CandlesService.getHistory (вызов без pipe).
  @ApiPropertyOptional({
    example: 500,
    default: 500,
    minimum: 1,
    maximum: 1000,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 500;
}
