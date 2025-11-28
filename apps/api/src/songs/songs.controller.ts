// src/songs/songs.controller.ts
import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { SongsService } from './songs.service';

@Controller('songs')
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Get()
  async getAllSongs() {
    return this.songsService.findAll();
  }

  @Get(':id')
  async getSongById(@Param('id', ParseIntPipe) id: number) {
    return this.songsService.findOne(id);
  }
}

