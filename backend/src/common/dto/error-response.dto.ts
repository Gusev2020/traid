/**
 * Контракт JSON-ответа при ошибке.
 *
 * Используется AllExceptionsFilter — клиент всегда получает одинаковую структуру,
 * независимо от типа ошибки (валидация, 404, Prisma, 500).
 *
 * requestId — связь с логами: клиент сообщает ID → находим запрос в pino-логах.
 */
export class ErrorResponseDto {
  statusCode!: number;
  code!: string;
  message!: string;
  path!: string;
  requestId?: string;
  timestamp!: string;
}
