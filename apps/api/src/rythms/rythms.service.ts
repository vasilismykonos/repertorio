// src/rythms/rythms.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RythmsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.rythm.findMany({
      orderBy: { title: "asc" },
    });
  }
}
