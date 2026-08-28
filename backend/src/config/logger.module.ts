import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

export const loggerModule = LoggerModule.forRoot({
  // Nest 11 + path-to-regexp v8: unnamed `*` becomes `/api/v1/*` and warns.
  forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = req.headers['x-request-id'];
      const id =
        typeof existing === 'string' && existing ? existing : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        '*.apiKey',
      ],
    },
    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const url = req.url ?? '';
        return url === '/health' || url.startsWith('/docs');
      },
    },
    transport:
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true } },
  },
});
