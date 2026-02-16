// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

function parseOrigins(): string[] {
  const raw = process.env.CORS_ALLOW_ORIGINS?.trim();
  if (raw)
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  return [
    'https://dev.repertorio.net',
    'https://app.repertorio.net',
    'https://repertorio.net',
    'https://www.repertorio.net',
    'http://localhost:3000',
    'http://localhost:3001',
  ];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // trust proxy (Express)
  // INestApplication δεν έχει app.set(), οπότε πάμε στο underlying express instance.
  const httpAdapter = app.getHttpAdapter();
  const instance: any = httpAdapter.getInstance();
  if (instance?.set) {
    instance.set('trust proxy', 1);
  }

  app.setGlobalPrefix('api/v1');

  const allowedOrigins = parseOrigins();
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = Number(process.env.PORT || 3000);

  // explicit bind
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`Nest API is running at http://0.0.0.0:${port}/api/v1`);
}

bootstrap();
