// apps/api/src/songs/songs.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { SongsService } from "./songs.service";

@Controller("songs")
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Get(":id")
  async findOne(
    @Param("id", ParseIntPipe) id: number,
    @Query("noIncrement") noIncrement?: string,
  ) {
    const noInc =
      noIncrement === "1" ||
      noIncrement === "true" ||
      noIncrement === "yes";
    return this.songsService.findOne(id, noInc);
  }

  @Patch(":id")
  async updateSong(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      firstLyrics?: string | null;
      lyrics?: string | null;
      characteristics?: string | null;
      originalKey?: string | null;
      defaultKey?: string | null;
      chords?: string | null;
      status?: any;
      categoryId?: number | null;
      rythmId?: number | null;
      basedOnSongId?: number | null;
      scoreFile?: string | null;
      highestVocalNote?: string | null;

      tagIds?: number[] | null;
      assets?: Array<{
        id?: number;
        kind: any;
        type?: any;
        title?: string | null;
        url?: string | null;
        filePath?: string | null;
        mimeType?: string | null;
        sizeBytes?: string | number | bigint | null;

        label?: string | null;
        sort?: number | null;
        isPrimary?: boolean | null;
      }> | null;

      // ✅ NEW
      versions?: Array<{
        id?: number | null;
        year?: number | string | null;
        youtubeSearch?: string | null;

        // ✅ preferred: ids (array or CSV string)
        singerFrontIds?: number[] | string | null;
        singerBackIds?: number[] | string | null;
        solistIds?: number[] | string | null;

        // ✅ backward compatible: comma-separated names
        singerFrontNames?: string | null;
        singerBackNames?: string | null;
        solistNames?: string | null;
      }> | null;
    },
  ) {
    return this.songsService.updateSong(id, body as any);
  }
}
