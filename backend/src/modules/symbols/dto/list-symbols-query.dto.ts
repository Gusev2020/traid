/**
 * Query GET /symbols (тикет 02). Потребитель — SymbolsController.list (@Query()).
 * Не голый @Query() — иначе ValidationPipe не применит whitelist/forbidNonWhitelisted.
 *
 * Это HTTP-край: class-validator режет 400 до сервиса. Defaults (active=true,
 * limit=50, offset=0) дублируются в SymbolsService.list на случай вызова без pipe.
 *
 * active приходит строкой; Boolean("false") === true, поэтому @Transform
 * читает исходный obj[key], а не value после enableImplicitConversion (app.setup.ts).
 *
 * Примеры в @ApiPropertyOptional нужны /docs; в openapi.json query всё равно
 * рисует контроллер через явный @ApiQuery (tsx-export без swagger-плагина).
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListSymbolsQueryDto {
  @ApiPropertyOptional({
    example: 'eth',
    description: 'Case-insensitive contains on ticker or name',
    type: String,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'true — only Active Symbol; false — only inactive',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    // obj — исходный query: enableImplicitConversion уже сделал Boolean("false") === true
    const raw = obj[key];
    if (raw === undefined || raw === null || raw === '') {
      return undefined;
    }
    if (raw === true || raw === 'true') {
      return true;
    }
    if (raw === false || raw === 'false') {
      return false;
    }
    return raw;
  })
  @IsBoolean()
  active?: boolean = true;

  @ApiPropertyOptional({
    example: 50,
    default: 50,
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    example: 0,
    default: 0,
    minimum: 0,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
