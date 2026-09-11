/**
 * Выгрузка OpenAPI-спеки без app.listen() — артефакт для CI и будущего фронта.
 *
 * Запуск: npm run openapi:export  →  backend/openapi.json (файл в .gitignore).
 *
 * NestFactory.create поднимает AppModule (Prisma подключится к локальной БД),
 * configureApp() вешает те же pipes/Swagger, что prod, затем createDocument
 * и запись на диск. Живой HTTP-порт не открывается.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { buildOpenApiDocument } from '../src/openapi';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  const document = buildOpenApiDocument(app);
  const out = join(process.cwd(), 'openapi.json');
  await writeFile(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
