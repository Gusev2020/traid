/**
 * JSON-карточка Symbol для клиента и для Swagger / OpenAPI.
 *
 * Денежных Decimal здесь нет; lastSyncedAt — строка или null
 * (seed ещё не синкался с CoinGecko, поэтому у BTC будет null).
 *
 * type: String/Boolean в @ApiProperty обязателен: tsx/openapi:export
 * не эмитит emitDecoratorMetadata, без явного type Swagger видит цикл.
 */
import { ApiProperty } from '@nestjs/swagger';

export class SymbolDto {
  @ApiProperty({ example: 'BTC', type: String })
  ticker!: string;

  @ApiProperty({ example: 'Bitcoin', type: String })
  name!: string;

  @ApiProperty({ example: 'bitcoin', type: String })
  coingeckoId!: string;

  @ApiProperty({ example: 'usd', type: String })
  vsCurrency!: string;

  @ApiProperty({ example: true, type: Boolean })
  isActive!: boolean;

  @ApiProperty({
    example: '2026-08-28T12:00:00.000Z',
    type: String,
    nullable: true,
  })
  lastSyncedAt!: string | null;
}
