import { PrismaService } from '../../prisma/prisma.service';
import { PrismaHealthIndicator } from './prisma-health.indicator';

describe('PrismaHealthIndicator', () => {
  it('returns up when ping succeeds', async () => {
    const prisma = { ping: jest.fn().mockResolvedValue(undefined) };
    const indicator = new PrismaHealthIndicator(
      prisma as unknown as PrismaService,
    );
    await expect(indicator.pingCheck('database')).resolves.toEqual({
      database: { status: 'up' },
    });
  });

  it('throws when ping fails', async () => {
    const prisma = {
      ping: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const indicator = new PrismaHealthIndicator(
      prisma as unknown as PrismaService,
    );
    await expect(indicator.pingCheck('database')).rejects.toThrow(
      'Database check failed',
    );
  });
});
