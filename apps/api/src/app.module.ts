// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RythmsModule } from './rythms/rythms.module';
import { CategoriesModule } from './categories/categories.module';
import { ArtistsModule } from './artists/artists.module';
import { SongsModule } from './songs/songs.module';
@Module({
  imports: [PrismaModule, RythmsModule, CategoriesModule, ArtistsModule, SongsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

