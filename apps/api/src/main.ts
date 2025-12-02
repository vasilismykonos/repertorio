// apps/api/src/main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Όλα τα endpoints να ξεκινούν από /api/v1
  app.setGlobalPrefix("api/v1");

  // Επιτρέπουμε CORS για frontend app.repertorio.net και local dev
  app.enableCors({
    origin: [
      "https://app.repertorio.net",
      "https://repertorio.net",
      "https://www.repertorio.net",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
  });

  // ΣΤΑΘΕΡΑ στην 3000, μόνο τοπικά.
  const port = 3000;
  const host = "127.0.0.1";

  await app.listen(port, host);
  const logger = new Logger("Bootstrap");
  logger.log(`Nest API is running at http://${host}:${port}/api/v1`);
}

bootstrap();
