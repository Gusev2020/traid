/**
 * Корневой модуль приложения (composition root).
 *
 * Здесь только «склеиваем» инфраструктурные модули — без бизнес-логики.
 * Порядок imports важен: конфиг и логгер должны загрузиться раньше
 * модулей, которые от них зависят.
 *
 * B3 тикет 01: ThrottlerModule + глобальный AppThrottlerGuard.
 * B3 тикет 02: CoinGeckoModule — переводчик свечей из Source. Крон Sync — тикет 04.
 *   B4 → AuthModule, CandlesGateway (WebSocket); @Throttle на login
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler/app-throttler.guard';
import { AppConfigModule } from './config/config.module';
import { loggerModule } from './config/logger.module';
import { CoinGeckoModule } from './integrations/coingecko/coingecko.module';
import { CandlesModule } from './modules/candles/candles.module';
import { HealthModule } from './modules/health/health.module';
import { SymbolsModule } from './modules/symbols/symbols.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    AppConfigModule, // 1. Читаем .env, валидируем через Zod (fail-fast)
    loggerModule, // 2. HTTP-логирование (pino)
    // 3. B3 тикет 01: внешний контур защиты HTTP (не квота CoinGecko).
    // short — антибурст, medium — базовый, long — антискрейпинг. Login throttle — B4.
    // skipIf: в jest без THROTTLER_E2E=1 guard молчит, чтобы B2 e2e не ловить 429.
    ThrottlerModule.forRoot({
      skipIf: () =>
        process.env.NODE_ENV === 'test' && process.env.THROTTLER_E2E !== '1',
      throttlers: [
        { name: 'short', ttl: seconds(1), limit: 5 },
        { name: 'medium', ttl: seconds(60), limit: 60 },
        { name: 'long', ttl: seconds(900), limit: 500 },
      ],
    }),
    PrismaModule, // 4. Подключение к Postgres (@Global — доступен везде)
    CoinGeckoModule, // 5. Переводчик CoinGecko → свечи (кэш, HTTP, предохранитель)
    HealthModule, // 6. GET /health — проверка, что приложение и БД живы
    SymbolsModule, // 7. B2: GET /symbols, GET /symbols/:ticker
    CandlesModule, // 8. B2: GET /candles (03–04) и GET /candles/latest (05)
  ],
  // Глобально: каждый HTTP-роут, кроме @SkipThrottle. JWT-guard появится в B4 рядом.
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
