// src/songs/songs.controller.ts
import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { SongsService } from "./songs.service";

@Controller("songs")
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  /**
   * Επιστρέφει ένα τραγούδι σε μορφή DTO, συμβατή
   * με το SongDetail του Next (SongPage.tsx).
   */
  @Get(":id")
  async getSongById(@Param("id", ParseIntPipe) id: number) {
    // Δεν χρησιμοποιούμε πλέον απευθείας Prisma,
    // αλλά το SongsService που:
    // - κάνει include category, rythm, versions, artists
    // - υπολογίζει categoryTitle, rythmTitle, composerName, lyricistName, versions κ.λπ.
    return this.songsService.findOne(id);
  }
}
