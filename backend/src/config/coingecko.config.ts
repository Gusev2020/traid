/**
 * Кусок конфига Nest с именем "coingecko".
 *
 * Зачем: в сервисах писать config.get('coingecko.baseUrl'), а не копаться
 * в process.env. Проверку «URL вообще есть?» делает validateEnv до этого.
 *
 * syncIntervalMs — как часто потом будет крутиться Sync (тикет 04).
 * Сейчас крон ещё не подключён, поле просто лежит в конфиге.
 */
import { registerAs } from '@nestjs/config';

export default registerAs('coingecko', () => ({
  baseUrl: process.env.COINGECKO_BASE_URL ?? '',
  apiKey: process.env.COINGECKO_API_KEY ?? '',
  rateLimitPerMin: Number(process.env.COINGECKO_RATE_LIMIT_PER_MIN ?? 50),
  cacheTtlMs: Number(process.env.COINGECKO_CACHE_TTL_MS ?? 60_000),
  syncIntervalMs: Number(process.env.CANDLE_SYNC_INTERVAL_MS ?? 60_000),
}));
