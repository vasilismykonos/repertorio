import { Body, Controller, Get, Param, ParseIntPipe, Put } from "@nestjs/common";
import { SongCreditsService } from "./song-credits.service";

type UpsertSongCreditsBody = {
  composerArtistIds?: number[]; // replace set
  lyricistArtistIds?: number[]; // replace set
};

@Controller("songs")
export class SongCreditsController {
  constructor(private readonly credits: SongCreditsService) {}

  @Get(":id/credits")
  async getCredits(@Param("id", ParseIntPipe) songId: number) {
    return this.credits.getSongCredits(songId);
  }

  /**
   * Replace credits για το τραγούδι.
   * Στέλνεις arrays με artist ids.
   */
  @Put(":id/credits")
  async replaceCredits(
    @Param("id", ParseIntPipe) songId: number,
    @Body() body: UpsertSongCreditsBody,
  ) {
    return this.credits.replaceSongCredits(songId, {
      composerArtistIds: body.composerArtistIds ?? [],
      lyricistArtistIds: body.lyricistArtistIds ?? [],
    });
  }
}
