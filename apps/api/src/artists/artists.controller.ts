import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from "@nestjs/common";
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

function toStringArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseIntOr(value: unknown, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

type UpdateArtistBody = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;

  // υπάρχουν στο UI type σου, αλλά ΔΕΝ υπάρχουν στο Prisma schema.
  // Τα δεχόμαστε για συμβατότητα, και απλά τα αγνοούμε στο update.
  imageUrl?: string | null;
  bornYear?: number | null;
  dieYear?: number | null;
};

@Controller("artists")
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  /**
   * GET /artists?take=&skip=&q=&role=...&role=...
   */
  @Get()
  async listArtists(
    @Query("q") q?: string,
    @Query("take") takeRaw?: string,
    @Query("skip") skipRaw?: string,
    @Query("role") roleRaw?: string | string[],
  ) {
    const take = clamp(parseIntOr(takeRaw, 50), 1, 200);
    const skip = Math.max(0, parseIntOr(skipRaw, 0));
    const qNorm = String(q ?? "").trim();

    const roles = toStringArray(roleRaw)
      .map((r) => String(r).trim())
      .filter(Boolean);

    const invalid = roles.filter(
      (r) => !ALLOWED_ROLES.includes(r as VersionArtistRoleString),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid role(s): ${invalid.join(", ")}`,
      );
    }

    const role = roles as VersionArtistRoleString[];

    return this.artistsService.search({
      q: qNorm || undefined,
      skip,
      take,
      role: role.length > 0 ? role : undefined,
    });
  }

  /**
   * GET /artists/:id
   */
  @Get(":id")
  async getArtistById(@Param("id", ParseIntPipe) id: number) {
    return this.artistsService.findOne(id);
  }

  /**
   * PATCH /artists/:id
   */
  @Patch(":id")
  async updateArtist(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateArtistBody,
  ) {
    return this.artistsService.updateArtist(id, body);
  }
}
