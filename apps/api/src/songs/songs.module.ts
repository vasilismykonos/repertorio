// src/songs/songs.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SongsController } from "./songs.controller";
import { SongsSearchController } from "./songs-search.controller";
import { SongsSearchService } from "./songs-search.service";

@Module({
  imports: [PrismaModule],
  // ΒΑΖΟΥΜΕ ΠΡΩΤΑ το SongsSearchController ώστε
  // το /songs/search να δηλώνεται πριν από το /songs/:id
  controllers: [SongsSearchController, SongsController],
  providers: [SongsSearchService],
})
export class SongsModule {}
