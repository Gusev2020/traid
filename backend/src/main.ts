/**
 * Точка входа приложения (B1 — слой «Фундамент»).
 *
 * Порядок запуска:
 *   1. NestFactory.create(AppModule) — собирает дерево модулей и вызывает lifecycle-хуки
 *      (например, PrismaService.onModuleInit → $connect к Postgres).
 *   2. configureApp() — глобальные настройки HTTP (prefix, pipes, filters, logger).
 *   3. app.listen(PORT) — сервер начинает принимать запросы.
 *
 * Если DATABASE_URL отсутствует или невалиден, приложение упадёт на шаге 1
 * (Zod-валидация в AppConfigModule) — это называется fail-fast.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  // bufferLogs: true — буферизует логи до подключения pino-логгера в configureApp(),
  // иначе первые сообщения Nest уйдут в дефолтный console.log.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Общие HTTP-настройки вынесены в отдельную функцию, чтобы e2e-тесты
  // применяли те же правила, что и production (см. test/app.e2e-spec.ts).
  configureApp(app);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  app.get(Logger).log(`Listening on ${port}`);
}

void bootstrap();
