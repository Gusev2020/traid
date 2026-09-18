/**
 * Проверка .env на старте: без адреса Source приложение не поднимется.
 * Пустой Demo-ключ разрешён — как в .env.example для локальной разработки.
 */
import { validateEnv } from './env.validation';

const valid = {
  NODE_ENV: 'test',
  PORT: '3001',
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://trading:pass@localhost:5432/trading_dashboard',
  COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
};

describe('validateEnv', () => {
  it('parses required variables', () => {
    const env = validateEnv(valid);
    expect(env.DATABASE_URL).toContain('postgresql://');
    expect(env.PORT).toBe(3001); // z.coerce.number превратил строку "3001" в number
    expect(env.COINGECKO_BASE_URL).toBe('https://api.coingecko.com/api/v3');
    expect(env.COINGECKO_API_KEY).toBe('');
    expect(env.COINGECKO_RATE_LIMIT_PER_MIN).toBe(50);
    expect(env.COINGECKO_CACHE_TTL_MS).toBe(60_000);
    expect(env.CANDLE_SYNC_INTERVAL_MS).toBe(60_000);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('fails fast when DATABASE_URL is empty', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: '' })).toThrow(
      /Invalid environment/,
    );
  });

  it('fails fast when COINGECKO_BASE_URL is missing', () => {
    expect(() =>
      validateEnv({ ...valid, COINGECKO_BASE_URL: undefined }),
    ).toThrow(/COINGECKO_BASE_URL/);
  });

  it('allows an empty Demo API key', () => {
    const env = validateEnv({ ...valid, COINGECKO_API_KEY: '' });
    expect(env.COINGECKO_API_KEY).toBe('');
  });
});
