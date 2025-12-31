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

import { ElasticsearchSongsSyncService } from "../elasticsearch/elasticsearch-songs-sync.service";


// ✅ Credits
import { SongCreditsController } from "./song-credits.controller";
import { SongCreditsService } from "./song-credits.service";

@Module({
  controllers: [
    SongTagsController,
    SongAssetsController,
    SongsSearchController,
    SongsController,

    // ✅ NEW
    SongCreditsController,
  ],
  providers: [
    PrismaService,
    SongsService,
    SongsSearchService,
    SongTagsService,
    SongAssetsService,

    // ✅ NEW
    SongCreditsService,

    // ✅ existing
    ElasticsearchSongsSyncService,
  ],
})
export class SongsModule {}
