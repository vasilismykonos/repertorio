// apps/api/src/songs/songs.module.ts

import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

import { SongsService } from "./songs.service";
import { SongsController } from "./songs.controller";

import { SongsSearchController } from "./songs-search.controller";
import { SongsSearchService } from "./songs-search.service";

import { SongTagsController } from "./tags.controller";
import { SongTagsService } from "./tags.service";

import { SongAssetsController } from "./assets.controller";
import { SongAssetsService } from "./assets.service";

// ✅ NEW
import { ElasticsearchSongsSyncService } from "../elasticsearch/elasticsearch-songs-sync.service";

@Module({
  /**
   * ⚠️ ΣΕΙΡΑ CONTROLLERS:
   * Πρέπει τα πιο “specific” routes να δηλώνονται ΠΡΙΝ το /songs/:id,
   * αλλιώς το /songs/:id θα “καταπίνει” το /songs/tags και θα πετάει 400 από ParseIntPipe.
   */
  controllers: [
    SongsSearchController,
    SongTagsController,
    SongAssetsController,
    SongsController,
  ],
  providers: [
    PrismaService,
    SongsService,
    SongsSearchService,
    SongTagsService,
    SongAssetsService,

    // ✅ NEW
    ElasticsearchSongsSyncService,
  ],
})
export class SongsModule {}
