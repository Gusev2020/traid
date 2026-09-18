/**
 * Настройки, которые модуль отдаёт кэшу и HTTP-клиенту.
 *
 * Откуда: .env уже проверен на старте, оттуда собирает CoinGeckoModule.
 * timeout сюда кладём числом 8000 — в .env его нет, чтобы никто не отключил.
 */
/** Имя токена Nest: «вот объект настроек». Не строка из .env. */
export const COINGECKO_SETTINGS = 'COINGECKO_SETTINGS';

/** Сколько миллисекунд ждём ответ Source, прежде чем бросить таймаут. */
export const COINGECKO_REQUEST_TIMEOUT_MS = 8_000;

export type CoinGeckoSettings = {
  /** База URL, например https://api.coingecko.com/api/v3 */
  baseUrl: string;
  /** Demo-ключ. Пустая строка — ходим без ключа. */
  apiKey: string;
  /** Своих запросов в минуту (кружка token bucket), обычно 50. */
  rateLimitPerMin: number;
  /** Как долго помнить ответ в кэше, обычно 60_000 мс. */
  cacheTtlMs: number;
  /** Таймаут одной попытки HTTP. */
  timeoutMs: number;
};
