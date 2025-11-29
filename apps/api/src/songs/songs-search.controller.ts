// src/songs/songs-search.controller.ts
import { Controller, Get, Req } from "@nestjs/common";
import { SongsSearchService } from "./songs-search.service";

@Controller("songs")
export class SongsSearchController {
  constructor(private readonly songsSearchService: SongsSearchService) {}

  @Get("search")
  async search(@Req() req: any) {
    const qRaw = req.query?.q;
    const skipRaw = req.query?.skip;
    const takeRaw = req.query?.take;

    // q: απλό string (ή undefined)
    const q = typeof qRaw === "string" ? qRaw : undefined;

    // skip: ασφαλές parse
    let skip = 0;
    if (typeof skipRaw === "string") {
      const parsed = parseInt(skipRaw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        skip = parsed;
      }
    }

    // take: ασφαλές parse, όριο 200
    let take = 50;
    if (typeof takeRaw === "string") {
      const parsed = parseInt(takeRaw, 10);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 200) {
        take = parsed;
      }
    }

    return this.songsSearchService.search({
      q,
      skip,
      take,
    });
  }
}
