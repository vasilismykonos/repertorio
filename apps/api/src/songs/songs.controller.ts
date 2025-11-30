// src/songs/songs.controller.ts
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("songs")
export class SongsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id")
  async getSongById(@Param("id", ParseIntPipe) id: number) {
    const song = await this.prisma.song.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        firstLyrics: true,
        lyrics: true,
        characteristics: true,
        originalKey: true,
        chords: true,
        status: true,
        // Include the scoreFile field so the client can determine if a
        // MusicXML/MXL exists for this song.
        scoreFile: true,
      },
    });

    if (!song) {
      throw new NotFoundException(`Song with id ${id} not found`);
    }

    return song;
  }
}
