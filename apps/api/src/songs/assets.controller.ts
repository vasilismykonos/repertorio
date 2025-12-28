// apps/api/src/songs/assets.controller.ts

import { Body, Controller, Get, Param, ParseIntPipe, Put } from "@nestjs/common";
import { SongAssetsService, SongAssetInput } from "./assets.service";

@Controller("songs")
export class SongAssetsController {
  constructor(private readonly assetsService: SongAssetsService) {}

  @Get(":id/assets")
  async list(@Param("id", ParseIntPipe) id: number) {
    return this.assetsService.listAssets(id);
  }

  @Put(":id/assets")
  async replace(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { assets: SongAssetInput[] },
  ) {
    return this.assetsService.replaceAssets(
      id,
      Array.isArray(body.assets) ? body.assets : [],
    );
  }
}
