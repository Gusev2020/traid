import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { loggerModule } from './config/logger.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [AppConfigModule, loggerModule, PrismaModule, HealthModule],
})
export class AppModule {}
