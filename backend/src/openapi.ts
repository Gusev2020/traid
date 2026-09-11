/**
 * Сборка OpenAPI 3 из декораторов контроллеров (ARCHITECTURE §4.7).
 *
 * Два потребителя одного документа:
 *   - setupOpenApi() — UI на /docs и сырой JSON на /docs-json (без префикса /api/v1)
 *   - npm run openapi:export — тот же DocumentBuilder, файл backend/openapi.json
 *
 * Теги candles/auth и Bearer — каркас спеки; роутов auth в B2 ещё нет.
 */
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Trading Dashboard API')
    .setDescription('Crypto OHLC data: REST + WebSocket')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('candles')
    .addTag('symbols')
    .addTag('auth')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupOpenApi(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
}
