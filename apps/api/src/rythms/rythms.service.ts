import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RythmsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rythms = await this.prisma.rythm.findMany({
      orderBy: { title: "asc" },
      include: {
        _count: {
          select: {
            songs: true,
          },
        },
      },
    });

    return rythms.map((r) => ({
      id: r.id,
      title: r.title,
      songsCount: r._count.songs,
    }));
  }
}
