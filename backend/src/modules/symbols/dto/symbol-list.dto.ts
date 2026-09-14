/**
 * JSON-страница GET /symbols (тикет 02). Собирает контроллер:
 * items = SymbolRecord[] через toDto() → SymbolDto; total — count из репозитория.
 *
 * Не путать с SymbolListQuery (вход репозитория) и ListSymbolsQueryDto (вход HTTP).
 * type задаём явно: openapi:export через tsx без emitDecoratorMetadata.
 */
import { ApiProperty } from '@nestjs/swagger';
import { SymbolDto } from './symbol.dto';

export class SymbolListDto {
  @ApiProperty({
    type: [SymbolDto],
    example: [
      {
        ticker: 'BTC',
        name: 'Bitcoin',
        coingeckoId: 'bitcoin',
        vsCurrency: 'usd',
        isActive: true,
        lastSyncedAt: null,
      },
    ],
  })
  items!: SymbolDto[];

  @ApiProperty({ example: 5, type: Number })
  total!: number;
}
