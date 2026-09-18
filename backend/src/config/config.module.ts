/**
 * Модуль конфигурации — первый, кто загружается при старте.
 *
 * Ответственность:
 *   1. Прочитать переменные из .env (файл в backend/ или ../.env монорепо)
 *   2. Провалидировать их через Zod (validateEnv) — fail-fast при ошибке
 *   3. Сделать ConfigService доступным глобально (isGlobal: true)
 *
 * Если DATABASE_URL пустой — приложение не стартует, а падает с понятной ошибкой.
 * B3: рядом лежит кусок "coingecko" (URL Source, ключ, лимит). JWT — тикет B4.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import coingeckoConfig from './coingecko.config';
import configuration from './configuration';
import { validateEnv } from './env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ConfigService доступен во всех модулях без повторного import
      cache: true, // process.env читается один раз, дальше из кэша
      expandVariables: true, // поддержка ${VAR} внутри .env
      envFilePath: [
        resolve(process.cwd(), '.env'), // запуск из backend/
        resolve(process.cwd(), '../.env'), // запуск из корня traid/ (основной .env)
      ],
      load: [configuration, coingeckoConfig], // "app" (порт, БД) и "coingecko" (Source)
      validate: validateEnv, // Zod-проверка — см. env.validation.ts
    }),
  ],
})
export class AppConfigModule {}
