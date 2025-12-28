// apps/api/src/songs/tags.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { SongTagsService } from "./tags.service";

function toInt(v: unknown, def: number): number {
  if (v === undefined || v === null) return def;
  const s = String(v).trim();
  if (!s) return def;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

@Controller("songs/tags")
export class SongTagsController {
  constructor(private readonly tagsService: SongTagsService) {}

  @Get()
  async list(
    @Query("search") search?: string,
    @Query("take") takeQ?: unknown,
    @Query("skip") skipQ?: unknown,
  ) {
    const take = toInt(takeQ, 25);
    const skip = toInt(skipQ, 0);
    return this.tagsService.listTags({ search, take, skip });
  }

  @Post()
  async create(@Body() body: { title: string }) {
    return this.tagsService.createTag(body);
  }

  @Patch(":id")
  async update(@Param("id") idStr: string, @Body() body: { title: string }) {
    const id = toInt(idStr, 0);
    return this.tagsService.updateTag(id, body);
  }

  @Delete(":id")
  async remove(@Param("id") idStr: string) {
    const id = toInt(idStr, 0);
    return this.tagsService.deleteTag(id);
  }
}
