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

export function configureApp(app: INestApplication): void {
  // Подключаем pino как логгер Nest (вместо встроенного Logger).
  app.useLogger(app.get(Logger));

  // Все REST-эндпоинты будут под /api/v1/...
  // Исключение: GET /health — короткий путь для load balancer / Kubernetes.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // ValidationPipe — задел на B2 (REST с DTO + class-validator).
  // Сейчас контроллеров с body/query нет, но pipe уже готов:
  //   whitelist            — лишние поля в запросе отбрасываются
  //   forbidNonWhitelisted — лишние поля → HTTP 400
  //   transform            — строки "123" автоматически станут number в DTO
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
}
