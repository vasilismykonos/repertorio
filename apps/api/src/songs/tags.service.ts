// apps/api/src/songs/tags.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TagDto = {
  id: number;
  title: string;
  slug: string;
  usageCount: number; // ✅ πόσες εγγραφές στο SongTag (join) το χρησιμοποιούν
};

export type ListTagsArgs = {
  search?: string;
  take?: number;
  skip?: number;
};

function normalizeTitleForSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugify(input: string): string {
  const s = normalizeTitleForSlug(input);

  return s
    .replace(/[^a-z0-9\u0370-\u03ff\u1f00-\u1fff]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.trunc(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class SongTagsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: {
    id: number;
    title: string;
    slug: string;
    _count?: { SongTag?: number };
  }): TagDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      usageCount: Number(row?._count?.SongTag ?? 0),
    };
  }

  async listTags(args: ListTagsArgs): Promise<TagDto[]> {
    const rawSearch = (args.search ?? '').toString().trim();
    const take = clampInt(args.take ?? 25, 1, 500);
    const skip = clampInt(args.skip ?? 0, 0, 1_000_000);

    const where =
      rawSearch.length > 0
        ? {
            OR: [
              { title: { contains: rawSearch, mode: 'insensitive' as const } },
              {
                // ✅ κρατάμε το παλιό behaviour: ψάχνουμε σε slug με slugify(rawSearch)
                slug: {
                  contains: slugify(rawSearch),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : undefined;

    const rows = await this.prisma.tag.findMany({
      where,
      orderBy: [{ title: 'asc' }],
      take,
      skip,
      select: {
        id: true,
        title: true,
        slug: true,
        _count: { select: { SongTag: true } }, // ✅ relation field στο schema: Tag.SongTag
      },
    });

    return rows.map((r) => this.toDto(r));
  }

  async createTag(body: { title: string }): Promise<TagDto> {
    const title = String(body?.title ?? '').trim();
    if (!title) throw new BadRequestException('title is required');

    const slug = slugify(title);
    if (!slug) throw new BadRequestException('invalid title');

    const row = await this.prisma.tag.upsert({
      where: { slug },
      update: { title },
      create: { title, slug },
      select: {
        id: true,
        title: true,
        slug: true,
        _count: { select: { SongTag: true } },
      },
    });

    return this.toDto(row);
  }

  // EDIT: αλλάζουμε ΜΟΝΟ title (slug σταθερό)
  async updateTag(id: number, body: { title: string }): Promise<TagDto> {
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('invalid id');
    }

    const title = String(body?.title ?? '').trim();
    if (!title) throw new BadRequestException('title is required');

    const exists = await this.prisma.tag.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('tag not found');

    const row = await this.prisma.tag.update({
      where: { id },
      data: { title },
      select: {
        id: true,
        title: true,
        slug: true,
        _count: { select: { SongTag: true } },
      },
    });

    return this.toDto(row);
  }

  async deleteTag(id: number): Promise<{ ok: true }> {
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('invalid id');
    }

    // ✅ ΜΠΛΟΚΑΡΟΥΜΕ ΔΙΑΓΡΑΦΗ ΑΝ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ
    const usageCount = await this.prisma.songTag.count({
      where: { tagId: id },
    });

    if (usageCount > 0) {
      throw new BadRequestException(
        `Tag is in use and cannot be deleted (usageCount=${usageCount})`,
      );
    }

    try {
      await this.prisma.tag.delete({ where: { id } });
      return { ok: true };
    } catch {
      throw new NotFoundException('tag not found');
    }
  }
}
