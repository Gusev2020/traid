/**
 * Конфиг Prisma CLI (6.19+): URL для migrate, путь к schema, seed.
 *
 * Не путать с рантаймом Nest: PrismaService по-прежнему new PrismaClient()
 * без adapter (это требование Prisma 7). Здесь только CLI.
 *
 * env грузим сами: при наличии prisma.config.ts Prisma больше не читает .env автоматически.
 */
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

for (const file of [
  resolve(__dirname, '../.env'),
  resolve(__dirname, '.env'),
]) {
  try {
    loadEnvFile(file);
  } catch {
    // файла может не быть (CI задаёт DATABASE_URL сам)
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  engine: 'classic',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
