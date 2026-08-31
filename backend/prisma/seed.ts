/**
 * Начальные данные для локальной разработки и тестов.
 *
 * Запуск: npm run prisma:seed (читает DATABASE_URL из ../.env)
 *
 * upsert — «создай, если нет; обнови, если есть»:
 *   повторный seed безопасен, дублей не будет (where по уникальному coingeckoId).
 *
 * На B1 seed заполняет только symbols.
 * Свечи (candles) появятся на B3 (CoinGecko sync), пользователи — на B4 (auth).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const symbols = [
  { coingeckoId: 'bitcoin', ticker: 'BTC', name: 'Bitcoin' },
  { coingeckoId: 'ethereum', ticker: 'ETH', name: 'Ethereum' },
  { coingeckoId: 'solana', ticker: 'SOL', name: 'Solana' },
  { coingeckoId: 'cardano', ticker: 'ADA', name: 'Cardano' },
  { coingeckoId: 'ripple', ticker: 'XRP', name: 'XRP' },
] as const;

async function main(): Promise<void> {
  for (const symbol of symbols) {
    await prisma.symbol.upsert({
      where: { coingeckoId: symbol.coingeckoId },
      create: symbol,
      update: {
        ticker: symbol.ticker,
        name: symbol.name,
        isActive: true,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
