/**
 * Zod-схема для валидации переменных окружения.
 *
 * Вызывается ConfigModule.forRoot({ validate: validateEnv }) ДО старта приложения.
 * Если переменная отсутствует или невалидна — throw Error → приложение не поднимается.
 *
 * B1: без адреса БД процесс не стартует.
 * B3: без адреса CoinGecko тоже. Пустой Demo-ключ можно. JWT — слой B4.
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
  /** Куда ходить за свечами. Без этого URL приложение не стартует. */
  COINGECKO_BASE_URL: z.string().url(),
  /** Demo-ключ CoinGecko. Пусто — можно, лимит тогда общий по IP. */
  COINGECKO_API_KEY: z.string().optional().default(''),
  /** Своих запросов к Source в минуту. По умолчанию 50 (половина Demo). */
  COINGECKO_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(50),
  /** Как долго помнить ответ Source в памяти, миллисекунды. */
  COINGECKO_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  /** Как часто Sync будет опрашивать Active Symbol (тикет 04). */
  CANDLE_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
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
