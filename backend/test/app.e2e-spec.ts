/**
 * E2E-тест слоя B1 — проверяет, что всё приложение собирается и отвечает.
 *
 * Отличие от unit-тестов:
 *   - Поднимается реальное Nest-приложение (AppModule + configureApp)
 *   - HTTP-запросы через supertest (как настоящий клиент)
 *
 * PrismaService подменён моком — e2e не требует живой Postgres,
 * но проверяет, что health-цепочка доходит до prisma.ping().
 *
 * Запуск: npm run test:e2e
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  // Мок PrismaService — имитируем БД без реального Postgres
  const prisma = {
    ping: jest.fn().mockResolvedValue(undefined),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://trading:change_me_strong_password@localhost:5432/trading_dashboard?schema=public';
    process.env.LOG_LEVEL = 'silent';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // overrideProvider — подменяем реальный PrismaService на мок
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app); // те же глобальные настройки, что в main.ts
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(prisma.ping).toHaveBeenCalled();
  });

  it('does not expose default Hello World on /', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
