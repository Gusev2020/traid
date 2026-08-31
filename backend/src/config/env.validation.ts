/**
 * Zod-схема для валидации переменных окружения.
 *
 * Вызывается ConfigModule.forRoot({ validate: validateEnv }) ДО старта приложения.
 * Если переменная отсутствует или невалидна — throw Error → приложение не поднимается.
 *
 * На B1 обязательны только 4 переменные ниже.
 * JWT, CoinGecko и прочие переменные из .env — задел на B3/B4, пока не валидируются.
 */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // z.coerce.number — строка "3001" из .env автоматически станет number
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('debug'),
  // Единственная обязательная переменная без default — без БД приложение бессмысленно
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

/** Тип, выведенный из Zod-схемы — можно использовать для автодополнения */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Функция-валидатор для ConfigModule.
 * @throws Error с перечислением всех проблем, если env невалиден
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
