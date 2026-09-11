/**
 * Корневой модуль приложения (composition root).
 *
 * Здесь только «склеиваем» инфраструктурные модули — без бизнес-логики.
 * Порядок imports важен: конфиг и логгер должны загрузиться раньше
 * модулей, которые от них зависят.
 *
 * Что добавится в следующих слоях ROADMAP:
 *   B2 → SymbolsModule, CandlesModule (REST API)
 *   B3 → CoinGeckoModule, CandleSyncScheduler
 *   B4 → AuthModule, CandlesGateway (WebSocket)
 */
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { loggerModule } from './config/logger.module';
import { HealthModule } from './modules/health/health.module';
import { SymbolsModule } from './modules/symbols/symbols.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    AppConfigModule, // 1. Читаем .env, валидируем через Zod (fail-fast)
    loggerModule, // 2. HTTP-логирование (pino)
    PrismaModule, // 3. Подключение к Postgres (@Global — доступен везде)
    HealthModule, // 4. GET /health — проверка, что приложение и БД живы
    SymbolsModule, // 5. B2: GET /symbols/:ticker
  ],
})
export class AppModule {}
