// src/songs/songs.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SongsController } from "./songs.controller";
import { SongsSearchController } from "./songs-search.controller";
import { SongsSearchService } from "./songs-search.service";
import { SongsService } from "./songs.service";

@Module({
  imports: [PrismaModule],
  // Πρώτα ο search controller ώστε /songs/search πριν από /songs/:id
  controllers: [SongsSearchController, SongsController],
  providers: [SongsSearchService, SongsService],
})
export class SongsModule {}
