// src/categories/categories.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { title: "asc" },
      include: {
        _count: {
          select: {
            songs: true, // <-- αν η σχέση λέγεται αλλιώς, άλλαξε ΜΟΝΟ αυτό
          },
        },
      },
    });
  }
}
