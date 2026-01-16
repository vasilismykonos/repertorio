import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { slugify } from "../utils/slugify";

@Injectable()
export class RythmsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transforms a rythm returned from Prisma into a DTO with `songsCount`.
   */
  private toDto(rythm: any) {
    return {
      id: rythm.id,
      title: rythm.title,
      slug: rythm.slug,
      createdAt: rythm.createdAt,
      updatedAt: rythm.updatedAt,
      songsCount: rythm._count?.songs ?? 0,
    };
  }

  /**
   * Lists rythms optionally filtered by a case-insensitive search query.
   * Results are sorted alphabetically by title.  Pagination parameters
   * `skip` and `take` may be provided to limit results.
   */
  async findAll(params?: { q?: string; skip?: number; take?: number }) {
    const { q, skip, take } = params ?? {};
    const where: any = {};
    if (q && q.trim()) {
      where.title = { contains: q.trim(), mode: "insensitive" };
    }
    const rythms = await this.prisma.rythm.findMany({
      where,
      orderBy: { title: "asc" },
      skip: typeof skip === "number" && skip >= 0 ? skip : undefined,
      take:
        typeof take === "number" && Number.isFinite(take)
          ? Math.min(200, Math.max(1, take))
          : undefined,
      include: { _count: { select: { songs: true } } },
    });
    return rythms.map((r) => this.toDto(r));
  }

  /**
   * Retrieves a rythm by id.  Throws if not found.
   */
  async findById(id: number) {
    const r = await this.prisma.rythm.findUnique({
      where: { id },
      include: { _count: { select: { songs: true } } },
    });
    if (!r) throw new NotFoundException("Rythm not found");
    return this.toDto(r);
  }

  /**
   * Creates a new rythm.  If slug is omitted or empty the slug will be
   * generated from the title.  Throws if the title is missing or blank.
   */
  async create(input: { title: string; slug?: string | null }) {
    const rawTitle = String(input.title ?? "").trim();
    if (!rawTitle) {
      throw new BadRequestException("Title is required");
    }
    // Normalise slug: if provided use it, otherwise derive from title.
    let slug = String(input.slug ?? "").trim();
    if (!slug) {
      slug = slugify(rawTitle);
    } else {
      slug = slugify(slug);
    }
    try {
      const r = await this.prisma.rythm.create({ data: { title: rawTitle, slug } });
      return this.toDto({ ...r, _count: { songs: 0 } });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new ConflictException("Rythm title or slug already exists");
      }
      throw e;
    }
  }

  /**
   * Updates an existing rythm.  If slug is omitted or blank it will be
   * regenerated from the new title (or existing title if title is unchanged).
   */
  async update(
    id: number,
    input: { title?: string | null; slug?: string | null },
  ) {
    const existing = await this.prisma.rythm.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Rythm not found");
    let title =
      input.title !== undefined && input.title !== null
        ? String(input.title).trim()
        : existing.title;
    let slug =
      input.slug !== undefined && input.slug !== null
        ? String(input.slug).trim()
        : existing.slug;
    if (!title) {
      throw new BadRequestException("Title is required");
    }
    if (!slug) {
      slug = slugify(title);
    } else {
      slug = slugify(slug);
    }
    try {
      const updated = await this.prisma.rythm.update({
        where: { id },
        data: { title, slug },
        include: { _count: { select: { songs: true } } },
      });
      return this.toDto(updated);
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new ConflictException("Rythm title or slug already exists");
      }
      throw e;
    }
  }

  /**
   * Deletes a rythm.  Prevent deleting a rythm that is still referenced by
   * songs to avoid accidental data integrity issues.  Throws if not found
   * or if in use.
   */
  async remove(id: number) {
    const existing = await this.prisma.rythm.findUnique({
      where: { id },
      include: { _count: { select: { songs: true } } },
    });
    if (!existing) throw new NotFoundException("Rythm not found");

    const songsCount = existing._count?.songs ?? 0;
    if (songsCount > 0) {
      throw new BadRequestException(
        `Δεν μπορεί να διαγραφεί ρυθμός που χρησιμοποιείται από ${songsCount} τραγούδι(α).`,
      );
    }

    await this.prisma.rythm.delete({ where: { id } });
    return { ok: true };
  }
}
