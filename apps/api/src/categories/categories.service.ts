// apps/api/src/categories/categories.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Service providing CRUD and search operations for song categories.
 *
 * Categories are simple resources with a title and a unique slug.  The service
 * centralises slug generation and normalisation so that the controller can
 * remain thin.  All methods return plain objects where the internal
 * `_count.songs` relation has been transformed into a `songsCount` field.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalises and slugifies a title or slug.  Accented Greek characters
   * are converted to their unaccented forms and non‑alphanumeric characters
   * are replaced with hyphens.  Multiple hyphens are collapsed and leading
   * or trailing hyphens are removed.
   */
  private slugify(input: string): string {
    return input
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove diacritics
      // allow greek letters and latin letters/numbers; replace everything else with '-'
      .replace(/[^a-z0-9\u0370-\u03ff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
  }

  /**
   * Transforms a category returned from Prisma into a DTO with `songsCount`.
   */
  private toDto(cat: any) {
    return {
      id: cat.id,
      title: cat.title,
      slug: cat.slug,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      songsCount: cat._count?.songs ?? 0,
    };
  }

  /**
   * Lists categories optionally filtered by a case-insensitive search query.
   * Results are sorted alphabetically by title.  Pagination parameters
   * `skip` and `take` may be provided to limit results.
   */
  async findAll(params?: { q?: string; skip?: number; take?: number }) {
    const { q, skip, take } = params ?? {};
    const where: any = {};
    if (q && q.trim()) {
      where.title = { contains: q.trim(), mode: "insensitive" };
    }
    const cats = await this.prisma.category.findMany({
      where,
      orderBy: { title: "asc" },
      skip: typeof skip === "number" && skip >= 0 ? skip : undefined,
      take:
        typeof take === "number" && Number.isFinite(take)
          ? Math.min(200, Math.max(1, take))
          : undefined,
      include: { _count: { select: { songs: true } } },
    });
    return cats.map((c) => this.toDto(c));
  }

  /**
   * Retrieves a category by id.  Throws if not found.
   */
  async findById(id: number) {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { songs: true } } },
    });
    if (!cat) throw new NotFoundException("Category not found");
    return this.toDto(cat);
  }

  /**
   * Creates a new category.  If slug is omitted or empty the slug will be
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
      slug = this.slugify(rawTitle);
    } else {
      slug = this.slugify(slug);
    }
    const category = await this.prisma.category.create({
      data: { title: rawTitle, slug },
    });
    return this.toDto({ ...category, _count: { songs: 0 } });
  }

  /**
   * Updates an existing category.  If slug is omitted or blank it will be
   * regenerated from the new title (or existing title if title is unchanged).
   */
  async update(
    id: number,
    input: { title?: string | null; slug?: string | null },
  ) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Category not found");
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
      slug = this.slugify(title);
    } else {
      slug = this.slugify(slug);
    }
    const updated = await this.prisma.category.update({
      where: { id },
      data: { title, slug },
      include: { _count: { select: { songs: true } } },
    });
    return this.toDto(updated);
  }

  /**
   * Deletes a category.
   *
   * Default policy for the platform: prevent deleting a category that is
   * still referenced by songs. This prevents accidental data integrity issues.
   *
   * If you prefer cascade/nullify behavior, change this method accordingly.
   */
  async remove(id: number) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { songs: true } } },
    });
    if (!existing) throw new NotFoundException("Category not found");

    const songsCount = existing._count?.songs ?? 0;
    if (songsCount > 0) {
      throw new BadRequestException(
        `Δεν μπορεί να διαγραφεί κατηγορία που χρησιμοποιείται από ${songsCount} τραγούδι(α).`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}