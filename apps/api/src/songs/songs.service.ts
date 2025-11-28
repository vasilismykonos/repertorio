// src/songs/songs.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Song } from '@prisma/client';

@Injectable()
export class SongsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Song[]> {
    return this.prisma.song.findMany({
      orderBy: { title: 'asc' },
    });
  }

  async findOne(id: number) {
    const song = await this.prisma.song.findUnique({
      where: { id },
      include: {
        category: true,
        rythm: true,
        makam: true,
        versions: {
          include: {
            artists: true, // SongVersionArtist[]
          },
        },
      },
    });

    if (!song) {
      throw new NotFoundException(`Song with id ${id} not found`);
    }

    return song;
  }
}

