/**
 * Единый формат JSON-ответа при любой ошибке.
 *
 * @Catch() без аргументов — ловит ВСЕ исключения (HttpException, Prisma, unknown).
 *
 * Поток обработки ошибки:
 *   1. Контроллер/сервис бросает exception
 *   2. Nest передаёт его сюда (глобальный filter из app.setup.ts)
 *   3. normalize() → statusCode, code, message
 *   4. Логируем (error для 5xx, warn для 4xx) с requestId
 *   5. Отправляем клиенту JSON { statusCode, code, message, path, requestId, timestamp }
 *
 * Маппинг Prisma-кодов — пригодится на B2/B4:
 *   P2002 → 409 Conflict (уникальный индекс нарушен)
 *   P2025 → 404 Not Found (запись не найдена при update/delete)
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import type { ErrorResponseDto } from '../dto/error-response.dto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message } = this.normalize(exception);
    const payload: ErrorResponseDto = {
      statusCode,
      code,
      message,
      path: request.url,
      requestId: this.headerId(request.headers['x-request-id']),
      timestamp: new Date().toISOString(),
    };

    if (statusCode >= 500) {
      this.logger.error(
        { err: exception, requestId: payload.requestId, path: payload.path },
        message,
      );
    } else {
      this.logger.warn(
        { requestId: payload.requestId, path: payload.path, code },
        message,
      );
    }

    response.status(statusCode).json(payload);
  }

  private headerId(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  /** Превращает любое исключение в { statusCode, code, message } */
  private normalize(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
  } {
    // Стандартные HTTP-ошибки Nest: BadRequestException, NotFoundException и т.д.
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ??
            exception.message);
      return {
        statusCode,
        code: exception.name.replace(/Exception$/, '').toUpperCase() || 'HTTP',
        message: Array.isArray(message) ? message.join('; ') : message,
      };
    }

    // Ошибки Prisma ORM (коды: https://www.prisma.io/docs/reference/api-reference/error-reference)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Resource already exists',
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Resource not found',
        };
      }
    }

    // Всё остальное — 500, детали не показываем клиенту (безопасность)
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }
}
