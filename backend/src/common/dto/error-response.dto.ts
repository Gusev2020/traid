/**
 * Контракт JSON-ответа при ошибке.
 *
 * Используется AllExceptionsFilter — клиент всегда получает одинаковую структуру,
 * независимо от типа ошибки (валидация, 404, Prisma, 500).
 *
 * requestId — связь с логами: клиент сообщает ID → находим запрос в pino-логах.
 *
 * @ApiProperty с example попадает в /docs и openapi.json; type задаём явно,
 * чтобы openapi:export через tsx не ломался на отсутствии decorator metadata.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 404, type: Number })
  statusCode!: number;

  @ApiProperty({ example: 'SYMBOL_NOT_FOUND', type: String })
  code!: string;

  @ApiProperty({ example: 'Symbol DOGE2 not found', type: String })
  message!: string;

  @ApiProperty({ example: '/api/v1/symbols/DOGE2', type: String })
  path!: string;

  @ApiPropertyOptional({ example: '01JG7X...', type: String })
  requestId?: string;

  @ApiProperty({ example: '2026-08-28T12:00:00.000Z', type: String })
  timestamp!: string;
}
