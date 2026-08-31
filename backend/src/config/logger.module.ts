/**
 * HTTP-логирование через nestjs-pino (обёртка над pino).
 *
 * Что делает на каждый входящий запрос:
 *   1. genReqId     — создаёт x-request-id (или берёт из заголовка клиента)
 *   2. autoLogging  — пишет method, url, statusCode, duration
 *   3. redact       — скрывает пароли, cookies, API-ключи в логах
 *
 * requestId потом попадает в AllExceptionsFilter → клиент видит его в JSON ошибки
 * и может сказать поддержке «вот мой requestId» для поиска в логах.
 */
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

export const loggerModule = LoggerModule.forRoot({
  // Nest 11 + path-to-regexp v8: unnamed `*` becomes `/api/v1/*` and warns.
  forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',

    // Корреляция запросов: один ID на весь жизненный цикл HTTP-запроса
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = req.headers['x-request-id'];
      const id =
        typeof existing === 'string' && existing ? existing : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },

    // Не логируем чувствительные данные (GDPR, безопасность)
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        '*.apiKey',
      ],
    },

    // /health дергают каждые 5–30 сек — не засоряем логи
    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const url = req.url ?? '';
        return url === '/health' || url.startsWith('/docs');
      },
    },

    // dev: красивый цветной вывод; prod/test: сырой JSON для log-агрегаторов
    transport:
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true } },
  },
});
