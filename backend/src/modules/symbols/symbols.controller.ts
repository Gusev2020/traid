/**
 * HTTP-слой Symbol. Без Prisma и без бизнес-логики.
 * Соседи: ListSymbolsQueryDto / SymbolTickerParamDto (вход),
 * SymbolsService (данные), SymbolDto / SymbolListDto (выход).
 *
 * Цепочка при GET /api/v1/symbols (тикет 02):
 *   1. ValidationPipe валидирует query через ListSymbolsQueryDto
 *      (лишние поля → 400, limit/offset, active=false как boolean)
 *   2. SymbolsService.list применяет default active=true, limit=50, offset=0
 *      и зовёт репозиторий; Prisma сюда не доходит
 *   3. toDto() на каждый SymbolRecord → items; total уже посчитан в БД
 *   4. 200 + SymbolListDto { items, total }
 *
 * Цепочка при GET /api/v1/symbols/:ticker (тикет 01):
 *   1. Nest маршрутизирует на этот контроллер (префикс /api/v1 — в app.setup.ts)
 *   2. ValidationPipe валидирует path-param через SymbolTickerParamDto
 *      и нормализует ticker в верхний регистр (btc → BTC)
 *   3. SymbolsService ищет карточку; нет строки → SymbolNotFoundError
 *   4. toDto() мапит domain-запись в JSON-контракт (Date → ISO-строка)
 *   5. 200 + SymbolDto; ошибка уходит в AllExceptionsFilter → 404 SYMBOL_NOT_FOUND
 *
 * @Get() объявлен выше @Get(':ticker'), чтобы пустой path не ушёл в :ticker.
 * JWT нет до B4: роут открыт так же, как /health. @Public() появится вместе с guard.
 * @ApiQuery/@ApiParam явно: openapi:export идёт через tsx без swagger-плагина,
 * design:paramtypes для query DTO в спеку не попадает.
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { ListSymbolsQueryDto } from './dto/list-symbols-query.dto';
import { SymbolDto } from './dto/symbol.dto';
import { SymbolListDto } from './dto/symbol-list.dto';
import { SymbolTickerParamDto } from './dto/symbol-ticker-param.dto';
import { SymbolRecord } from './symbol.record';
import { SymbolsService } from './symbols.service';

@ApiTags('symbols')
@Controller('symbols')
export class SymbolsController {
  constructor(private readonly symbols: SymbolsService) {}

  /** Тикет 02: страница. Query уже валиден; наружу мапим Record → SymbolDto. */
  @Get()
  @ApiOperation({ summary: 'List Symbol' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'eth',
    description: 'Case-insensitive contains on ticker or name',
  })
  @ApiQuery({
    name: 'active',
    required: false,
    type: Boolean,
    example: true,
    schema: { type: 'boolean', default: true, example: true },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 50,
    schema: {
      type: 'integer',
      default: 50,
      minimum: 1,
      maximum: 100,
      example: 50,
    },
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    example: 0,
    schema: { type: 'integer', default: 0, minimum: 0, example: 0 },
  })
  @ApiOkResponse({ type: SymbolListDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async list(@Query() query: ListSymbolsQueryDto): Promise<SymbolListDto> {
    const page = await this.symbols.list({
      search: query.search,
      active: query.active,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: page.items.map((symbol) => this.toDto(symbol)),
      total: page.total,
    };
  }

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
