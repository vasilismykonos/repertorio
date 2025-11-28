// src/artists/artists.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Artist } from '@prisma/client';

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Artist[]> {
    // ΟΜΟΙΑ ΛΟΓΙΚΗ ΜΕ ΤΟ MIGRATION:
    // Αν στο Prisma το πεδίο είναι "title", άλλαξε name -> title.
    return this.prisma.artist.findMany({
      orderBy: { title: 'asc' },
    });
  }
}

