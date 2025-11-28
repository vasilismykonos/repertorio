// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix για όλα τα endpoints
  app.setGlobalPrefix('api/v1');

  await app.listen(3000);
}
bootstrap();
