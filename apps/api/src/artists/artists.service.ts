// src/artists/artists.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.artist.findMany({
      orderBy: { id: "asc" },
    });

  }
}
