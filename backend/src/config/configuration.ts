/**
 * Типизированный конфиг с namespace "app".
 *
 * Использование в сервисах (на B2+):
 *   constructor(private config: ConfigService) {}
 *   this.config.get<number>('app.port')
 *   this.config.get<string>('app.databaseUrl')
 *
 * Сейчас main.ts читает PORT напрямую из process.env — на B2 лучше перейти на ConfigService.
 */
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  databaseUrl: process.env.DATABASE_URL ?? '',
}));
