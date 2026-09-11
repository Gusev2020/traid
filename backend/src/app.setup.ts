/**
 * Глобальная настройка HTTP-слоя.
 *
 * Вынесено из main.ts, чтобы:
 *   - main.ts оставался коротким и читаемым;
 *   - e2e-тесты вызывали configureApp() и получали те же правила, что prod.
 *
 * Вызывается ОДИН раз после NestFactory.create(), но ДО app.listen().
 */
import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { setupOpenApi } from './openapi';

export function configureApp(app: INestApplication): void {
  // Подключаем pino как логгер Nest (вместо встроенного Logger).
  app.useLogger(app.get(Logger));

  // Все REST-эндпоинты будут под /api/v1/...
  // Исключения: GET /health (probe) и /docs* (Swagger / OpenAPI JSON).
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'docs', method: RequestMethod.GET },
      { path: 'docs-json', method: RequestMethod.GET },
      { path: 'docs-yaml', method: RequestMethod.GET },
    ],
  });

  // ValidationPipe — REST с DTO + class-validator (B2: path/query Symbol и Candle).
  //   whitelist            — лишние поля в запросе отбрасываются
  //   forbidNonWhitelisted — лишние поля → HTTP 400
  //   transform            — "btc" → BTC в SymbolTickerParamDto, "123" → number
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Ловит ЛЮБУЮ необработанную ошибку и возвращает единый JSON-формат.
  // См. common/filters/all-exceptions.filter.ts
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

  // При SIGTERM/SIGINT Nest вызовет onModuleDestroy → PrismaService.$disconnect().
  // Нужно для корректного завершения в Docker/Kubernetes.
  app.enableShutdownHooks();

  // Swagger UI /docs и сырой OpenAPI JSON /docs-json (вне префикса /api/v1).
  setupOpenApi(app);
}
