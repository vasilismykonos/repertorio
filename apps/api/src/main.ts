// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      "https://repertorio.net",
      "https://www.repertorio.net",
      "https://app.repertorio.net",
    ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization,X-Requested-With",
    credentials: true,
  });

  // Global prefix για όλα τα endpoints
  app.setGlobalPrefix('api/v1');

  // Ακούει ΜΟΝΟ τοπικά!
  await app.listen(3000, "127.0.0.1");
}

bootstrap();
