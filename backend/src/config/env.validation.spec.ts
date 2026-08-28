import { validateEnv } from './env.validation';

const valid = {
  NODE_ENV: 'test',
  PORT: '3001',
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://trading:pass@localhost:5432/trading_dashboard',
};

describe('validateEnv', () => {
  it('parses required variables', () => {
    const env = validateEnv(valid);
    expect(env.DATABASE_URL).toContain('postgresql://');
    expect(env.PORT).toBe(3001);
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
});
