/**
 * HTTP-слой Symbol. Без Prisma и без бизнес-логики.
 *
 * Цепочка при GET /api/v1/symbols/:ticker:
 *   1. Nest маршрутизирует на этот контроллер (префикс /api/v1 — в app.setup.ts)
 *   2. ValidationPipe валидирует path-param через SymbolTickerParamDto
 *      и нормализует ticker в верхний регистр (btc → BTC)
 *   3. SymbolsService ищет карточку; нет строки → SymbolNotFoundError
 *   4. toDto() мапит domain-запись в JSON-контракт (Date → ISO-строка)
 *   5. 200 + SymbolDto; ошибка уходит в AllExceptionsFilter → 404 SYMBOL_NOT_FOUND
 *
 * JWT нет до B4: роут открыт так же, как /health. @Public() появится вместе с guard.
 */
import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { SymbolDto } from './dto/symbol.dto';
import { SymbolTickerParamDto } from './dto/symbol-ticker-param.dto';
import { SymbolRecord } from './symbol.record';
import { SymbolsService } from './symbols.service';

@ApiTags('symbols')
@Controller('symbols')
export class SymbolsController {
  constructor(private readonly symbols: SymbolsService) {}

  @Get(':ticker')
  @ApiOperation({ summary: 'Get Symbol by ticker' })
  @ApiParam({ name: 'ticker', example: 'BTC' })
  @ApiOkResponse({ type: SymbolDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async getByTicker(@Param() params: SymbolTickerParamDto): Promise<SymbolDto> {
    const symbol = await this.symbols.getByTicker(params.ticker);
    return this.toDto(symbol);
  }

  /** Domain → HTTP: lastSyncedAt сериализуем строкой, чтобы фронт не парсил Date. */
  private toDto(symbol: SymbolRecord): SymbolDto {
    return {
      ticker: symbol.ticker,
      name: symbol.name,
      coingeckoId: symbol.coingeckoId,
      vsCurrency: symbol.vsCurrency,
      isActive: symbol.isActive,
      lastSyncedAt: symbol.lastSyncedAt?.toISOString() ?? null,
    };
  }
}
