import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  app.get(Logger).log(`Listening on ${port}`);
}

void bootstrap();
