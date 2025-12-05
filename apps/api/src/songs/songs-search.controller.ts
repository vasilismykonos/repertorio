// apps/api/src/songs/songs-search.controller.ts
import { Controller, Get, Query } from "@nestjs/common";
import { SongsSearchService } from "./songs-search.service";

@Controller("songs")
export class SongsSearchController {
  constructor(private readonly songsSearchService: SongsSearchService) {}

  @Get("search")
  async search(
    @Query("q") q?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("createdByUserId") createdByUserId?: string,
  ) {
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const parsedTake = take ? parseInt(take, 10) : 20;
    const parsedUserId = createdByUserId
      ? parseInt(createdByUserId, 10)
      : undefined;

    const skipNum = Number.isNaN(parsedSkip) || parsedSkip < 0 ? 0 : parsedSkip;

    // Φρένο στο take για να μην “σκοτώνεται” η DB/ES
    let takeNum = Number.isNaN(parsedTake) ? 20 : parsedTake;
    if (takeNum <= 0) takeNum = 20;
    if (takeNum > 100) takeNum = 100;

    const userIdNum =
      parsedUserId !== undefined && !Number.isNaN(parsedUserId)
        ? parsedUserId
        : undefined;

    return this.songsSearchService.search({
      q,
      skip: skipNum,
      take: takeNum,
      createdByUserId: userIdNum,
    });
  }
}
