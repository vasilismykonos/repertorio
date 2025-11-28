// src/rythms/rythms.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Rythm } from '@prisma/client';

@Injectable()
export class RythmsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Rythm[]> {
    return this.prisma.rythm.findMany({
      orderBy: { title: 'asc' },
    });
  }
}

