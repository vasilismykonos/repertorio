// apps/api/src/songs/songs.module.ts

import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

import { SongsService } from "./songs.service";
import { SongsController } from "./songs.controller";

import { SongsSearchController } from "./songs-search.controller";
import { SongsSearchService } from "./songs-search.service";

import { SongTagsController } from "./tags.controller";
import { SongTagsService } from "./tags.service";

// ✅ existing
import { ElasticsearchSongsSyncService } from "../elasticsearch/elasticsearch-songs-sync.service";

// ✅ needed by SongsController
import { SongCreditsService } from "./song-credits.service";

// ✅ NEW
// apps/api/src/songs/songs.module.ts
import { SongSingerTunesController } from "./song-singer-tunes.controller";
import { SongSingerTunesService } from "./song-singer-tunes.service";

import { SongSingerTuneAccessService } from "./SongSingerTuneAccess.service";
import { SongSingerTuneAccessController } from "./SongSingerTuneAccess.controller";


@Module({
  controllers: [
    SongTagsController,
    SongsSearchController,
    SongsController,
    SongSingerTunesController,
    SongSingerTuneAccessController,
  ],
  providers: [
    PrismaService,
    SongsService,
    SongsSearchService,
    SongTagsService,
    SongCreditsService,
    ElasticsearchSongsSyncService,
    SongSingerTunesService, 
    SongSingerTuneAccessService,
  ],
})
export class SongsModule {}

