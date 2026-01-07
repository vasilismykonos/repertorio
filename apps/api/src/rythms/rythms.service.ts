import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RythmsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rythms = await this.prisma.rythm.findMany({
      orderBy: { title: "asc" },
      include: { _count: { select: { songs: true } } },
    });

    return rythms.map((r) => ({
      id: r.id,
      title: r.title,
      songsCount: r._count.songs,
    }));
  }

  async create(input: { title: string }) {
    const title = String(input.title ?? "").trim();
    if (!title) throw new BadRequestException("Title is required");

    try {
      return await this.prisma.rythm.create({ data: { title } });
    } catch (e: any) {
      // Prisma unique violation → rythm.title is @unique
      if (e?.code === "P2002") {
        throw new ConflictException("Rythm title already exists");
      }
      throw e;
    }
  }
}
