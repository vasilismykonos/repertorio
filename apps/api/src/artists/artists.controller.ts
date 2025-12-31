import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ArtistsService } from "./artists.service";

type VersionArtistRoleString =
  | "SINGER_FRONT"
  | "SINGER_BACK"
  | "SOLOIST"
  | "MUSICIAN";

const ALLOWED_ROLES: VersionArtistRoleString[] = [
  "SINGER_FRONT",
  "SINGER_BACK",
  "SOLOIST",
  "MUSICIAN",
];

type UpdateArtistBody = {
  // title μπορεί να έρθει από UI αλλά ΔΕΝ πρέπει να το εμπιστευόμαστε (το service το υπολογίζει)
  title?: string | null;

  firstName?: string | null;
  lastName?: string | null;

  sex?: string | null;
  bornYear?: number | null;
  dieYear?: number | null;

  imageUrl?: string | null;
  biography?: string | null;
  wikiUrl?: string | null;
};

type CreateArtistBody = {
  title: string;
  firstName?: string | null;
  lastName?: string | null;
  legacyArtistId?: number | null;
};

function toInt(input: unknown, fallback: number): number {
  const n = Math.trunc(Number(input));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRoles(roleRaw?: string | string[]): VersionArtistRoleString[] {
  const arr = Array.isArray(roleRaw) ? roleRaw : roleRaw ? [roleRaw] : [];
  const out: VersionArtistRoleString[] = [];
  const seen = new Set<string>();

  for (const r of arr) {
    const s = String(r ?? "").trim().toUpperCase();
    if (!s) continue;
    if (!ALLOWED_ROLES.includes(s as VersionArtistRoleString)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s as VersionArtistRoleString);
  }

  return out;
}

@Controller("artists")
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Get()
  async listArtists(
    @Query("q") q?: string,
    @Query("take") takeRaw?: string,
    @Query("skip") skipRaw?: string,
    @Query("role") roleRaw?: string | string[],
  ) {
    const take = Math.min(200, Math.max(1, toInt(takeRaw, 20)));
    const skip = Math.max(0, toInt(skipRaw, 0));
    const role = normalizeRoles(roleRaw);

    return this.artistsService.search({
      q: (q ?? "").trim() || undefined,
      skip,
      take,
      role: role.length > 0 ? role : undefined,
    } as any);
  }

  @Get("search")
  async searchArtists(@Query("q") q?: string, @Query("take") takeRaw?: string) {
    const take = Math.min(200, Math.max(1, toInt(takeRaw, 20)));
    return this.artistsService.search({
      q: (q ?? "").trim() || undefined,
      skip: 0,
      take,
      role: undefined,
    } as any);
  }

  // ✅ BACKWARD COMPAT: κρατάμε το POST /artists όπως πριν
  @Post()
  async createArtist(@Body() body: CreateArtistBody) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid body");
    }

    const title = String((body as any).title ?? "").trim().replace(/\s+/g, " ");
    if (!title) throw new BadRequestException("title is required");

    return this.artistsService.findOrCreate({
      title,
      firstName: "firstName" in body ? (body.firstName ?? null) : null,
      lastName: "lastName" in body ? (body.lastName ?? null) : null,
      legacyArtistId:
        (body as any).legacyArtistId == null
          ? null
          : Number.isFinite(Number((body as any).legacyArtistId))
            ? Math.trunc(Number((body as any).legacyArtistId))
            : null,
    });
  }

  // ✅ ΠΡΟΑΙΡΕΤΙΚΟ/ΝΕΟ: πιο “ρητό” endpoint για το ίδιο ακριβώς πράγμα
  @Post("find-or-create")
  async findOrCreate(@Body() body: CreateArtistBody) {
    // ίδια λογική με το createArtist για να μην έχεις διπλά standards
    return this.createArtist(body);
  }

  @Get(":id")
  async getArtistById(@Param("id", ParseIntPipe) id: number) {
    return this.artistsService.findOne(id);
  }

  @Patch(":id")
  async updateArtist(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateArtistBody,
  ) {
    return this.artistsService.updateArtist(id, body);
  }

  // ✅ NEW: upload εικόνας (multipart/form-data, field name: "file")
  @Post(":id/image")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        const ok = ["image/jpeg", "image/png", "image/webp"].includes(
          String(file.mimetype || "").toLowerCase(),
        );
        cb(
          ok
            ? null
            : new BadRequestException("Μόνο εικόνες JPG/PNG/WebP επιτρέπονται."),
          ok,
        );
      },
    }),
  )
  async uploadArtistImage(
    @Param("id", ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Το αρχείο είναι υποχρεωτικό.");
    return this.artistsService.uploadArtistImage(id, file);
  }

  @Delete(":id")
  async deleteArtist(@Param("id", ParseIntPipe) id: number) {
    await this.artistsService.deleteArtist(id);
    return { success: true };
  }
}
