/**
 * Path-param :ticker. Не голая строка @Param('ticker') —
 * глобальный ValidationPipe тогда не применит whitelist/transform.
 *
 * @Transform toUpperCase — «btc» и «BTC» резолвятся в одну карточку.
 * Срабатывает, потому что в app.setup.ts pipe с transform: true.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class SymbolTickerParamDto {
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
  ticker!: string;
}
