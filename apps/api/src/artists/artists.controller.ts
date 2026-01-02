// apps/api/src/artists/artists.controller.ts


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
  /**
   * Optional display title for the artist.  If omitted the title will be
   * generated automatically from the provided firstName/lastName.
   */
  title?: string | null;

  /**
   * Optional first name.  Used together with lastName to compute the
   * display title when title is omitted.
   */
  firstName?: string | null;

  /**
   * Optional last name.  Used together with firstName to compute the
   * display title when title is omitted.
   */
  lastName?: string | null;

  /**
   * Optional legacy ID for migration/compatibility purposes.
   */
  legacyArtistId?: number | null;
};

// ✅ NEW: Full Create/Update μέσω multipart/form-data (fields + optional file)
type ArtistFullBody = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;

  sex?: string | null;
  bornYear?: string | number | null;
  dieYear?: string | number | null;

  wikiUrl?: string | null;
  biography?: string | null;

  // (προαιρετικά) αν θέλεις να το δέχεσαι
  imageUrl?: string | null;
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

function normalizeNullableText(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s ? s : null;
}

function parseNullableNumber(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new BadRequestException("Invalid number");
  }
  return Math.trunc(n);
}

const IMAGE_INTERCEPTOR = FileInterceptor("file", {
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
});

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

    // Normalize the raw title and optional names.  Historically the title
    // field was required, but we now allow clients to omit it and instead
    // provide firstName/lastName which will be used to compute the display
    // title.  If all of these are missing we throw a validation error.
    const rawTitle = String((body as any).title ?? "").trim().replace(/\s+/g, " ");

    const firstNameVal = Object.prototype.hasOwnProperty.call(body, "firstName")
      ? (body.firstName ?? null)
      : null;
    const lastNameVal = Object.prototype.hasOwnProperty.call(body, "lastName")
      ? (body.lastName ?? null)
      : null;

    // Reject completely empty submissions (no title and no names)
    if (!rawTitle && !firstNameVal && !lastNameVal) {
      throw new BadRequestException(
        "title or firstName/lastName is required",
      );
    }

    // Parse legacyArtistId safely
    const legacyArtistId = (body as any).legacyArtistId == null
      ? null
      : Number.isFinite(Number((body as any).legacyArtistId))
        ? Math.trunc(Number((body as any).legacyArtistId))
        : null;

    return this.artistsService.findOrCreate({
      title: rawTitle,
      firstName: firstNameVal,
      lastName: lastNameVal,
      legacyArtistId,
    });
  }

  // ✅ ΠΡΟΑΙΡΕΤΙΚΟ/ΝΕΟ: πιο “ρητό” endpoint για το ίδιο ακριβώς πράγμα
  @Post("find-or-create")
  async findOrCreate(@Body() body: CreateArtistBody) {
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

  // ✅ upload εικόνας (multipart/form-data, field name: "file")
  @Post(":id/image")
  @UseInterceptors(IMAGE_INTERCEPTOR)
  async uploadArtistImage(
    @Param("id", ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Το αρχείο είναι υποχρεωτικό.");
    return this.artistsService.uploadArtistImage(id, file);
  }

  // ✅ NEW: “Full” create (δεν αποθηκεύεται τίποτα μέχρι να πατηθεί Save στο UI)
  // multipart/form-data: fields + optional file
  @Post("full")
  @UseInterceptors(IMAGE_INTERCEPTOR)
  async createArtistFull(
    @Body() body: ArtistFullBody,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid body");
    }

    const bornYear =
      "bornYear" in body ? parseNullableNumber((body as any).bornYear) : null;
    const dieYear =
      "dieYear" in body ? parseNullableNumber((body as any).dieYear) : null;

    return this.artistsService.createArtistFull(
      {
        title: normalizeNullableText((body as any).title),
        firstName:
          "firstName" in body ? normalizeNullableText((body as any).firstName) : null,
        lastName:
          "lastName" in body ? normalizeNullableText((body as any).lastName) : null,

        sex: "sex" in body ? normalizeNullableText((body as any).sex) : null,
        bornYear,
        dieYear,

        wikiUrl:
          "wikiUrl" in body ? normalizeNullableText((body as any).wikiUrl) : null,
        biography:
          "biography" in body ? normalizeNullableText((body as any).biography) : null,

        imageUrl:
          "imageUrl" in body ? normalizeNullableText((body as any).imageUrl) : null,
      },
      file,
    );
  }

  // ✅ NEW: “Full” update (multipart/form-data)
  @Patch(":id/full")
  @UseInterceptors(IMAGE_INTERCEPTOR)
  async updateArtistFull(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ArtistFullBody,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid body");
    }

    // ⚠️ στο update θέλουμε “undefined” όταν δεν υπάρχει field (ώστε το service να μην το πειράξει)
    const bornYear =
      "bornYear" in body ? parseNullableNumber((body as any).bornYear) : undefined;
    const dieYear =
      "dieYear" in body ? parseNullableNumber((body as any).dieYear) : undefined;

    return this.artistsService.updateArtistFull(
      id,
      {
        title: "title" in body ? normalizeNullableText((body as any).title) : undefined,
        firstName:
          "firstName" in body ? normalizeNullableText((body as any).firstName) : undefined,
        lastName:
          "lastName" in body ? normalizeNullableText((body as any).lastName) : undefined,

        sex: "sex" in body ? normalizeNullableText((body as any).sex) : undefined,
        bornYear,
        dieYear,

        wikiUrl:
          "wikiUrl" in body ? normalizeNullableText((body as any).wikiUrl) : undefined,
        biography:
          "biography" in body ? normalizeNullableText((body as any).biography) : undefined,

        imageUrl:
          "imageUrl" in body ? normalizeNullableText((body as any).imageUrl) : undefined,
      },
      file,
    );
  }

  @Delete(":id")
  async deleteArtist(@Param("id", ParseIntPipe) id: number) {
    await this.artistsService.deleteArtist(id);
    return { success: true };
  }
}
