// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
  origin: [
    "https://repertorio.net",
    "https://app.repertorio.net",
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization,X-Requested-With",
  credentials: false, // αν μετά χρειαστούμε cookies/JWT με credentials, το κάνουμε true
});

  // Global prefix για όλα τα endpoints
  app.setGlobalPrefix('api/v1');

  await app.listen(3000);
}
bootstrap();
