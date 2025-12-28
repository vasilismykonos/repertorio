// apps/api/src/app.module.ts

import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RythmsModule } from "./rythms/rythms.module";
import { CategoriesModule } from "./categories/categories.module";
import { ArtistsModule } from "./artists/artists.module";
import { SongsModule } from "./songs/songs.module";
import { UsersModule } from "./users/users.module";
import { ListsModule } from "./lists/lists.module";

// ΝΕΟ path (μετά τη μεταφορά)
import { ElasticsearchAdminModule } from "./elasticsearch/elasticsearch-admin.module";

@Module({
  imports: [
    PrismaModule,
    RythmsModule,
    CategoriesModule,
    ArtistsModule,
    SongsModule,
    UsersModule,
    ListsModule,
    ElasticsearchAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
