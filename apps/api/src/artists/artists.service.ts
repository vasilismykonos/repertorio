import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";

type VersionArtistRoleString =
  | "SINGER_FRONT"
  | "SINGER_BACK"
  | "SOLOIST"
  | "MUSICIAN";

type ArtistListItem = {
  id: number;
  legacyArtistId: number | null;
  title: string;
  firstName: string | null;
  lastName: string | null;

  // για συμβατότητα με το UI type (δεν υπάρχουν στη DB σου)
  imageUrl: string | null;
  bornYear: number | null;
  dieYear: number | null;
};

type ArtistsSearchResponse = {
  items: ArtistListItem[];
  total: number;
  skip: number;
  take: number;
  q: string;
  role?: VersionArtistRoleString[];
};

type ArtistSearchParams = {
  q?: string;
  skip: number;
  take: number;
  role?: VersionArtistRoleString[];
};

type UpdateArtistBody = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;

  // ignored (not in schema)
  imageUrl?: string | null;
  bornYear?: number | null;
  dieYear?: number | null;
};

function mapArtistRow(row: {
  id: number;
  legacyArtistId: number | null;
  title: string;
  firstName: string | null;
  lastName: string | null;
}): ArtistListItem {
  return {
    ...row,
    imageUrl: null,
    bornYear: null,
    dieYear: null,
  };
}

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(params: ArtistSearchParams): Promise<ArtistsSearchResponse> {
    const q = String(params.q ?? "").trim();
    const skip = Math.max(0, Number(params.skip) || 0);
    const take = Math.max(1, Number(params.take) || 50);
    const role = params.role && params.role.length > 0 ? params.role : undefined;

    const where: Prisma.ArtistWhereInput = {};

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ];
    }

    // Φιλτράρισμα role μέσω songVersionArtist (σύμφωνα με schema.prisma)
    if (role) {
      const rows = await this.prisma.songVersionArtist.findMany({
        where: { role: { in: role as any } },
        select: { artistId: true },
        distinct: ["artistId"],
      });

      const ids = rows
        .map((r) => r.artistId)
        .filter((id) => Number.isFinite(id));

      if (ids.length === 0) {
        return {
          items: [],
          total: 0,
          skip,
          take,
          q,
          role,
        };
      }

      where.id = { in: ids };
    }

    const [rows, total] = await Promise.all([
      this.prisma.artist.findMany({
        where,
        skip,
        take,
        orderBy: { title: "asc" },
        select: {
          id: true,
          legacyArtistId: true,
          title: true,
          firstName: true,
          lastName: true,
        },
      }),
      this.prisma.artist.count({ where }),
    ]);

    return {
      items: rows.map(mapArtistRow),
      total,
      skip,
      take,
      q,
      ...(role ? { role } : {}),
    };
  }

  async findOne(id: number): Promise<ArtistListItem> {
    const row = await this.prisma.artist.findUnique({
      where: { id },
      select: {
        id: true,
        legacyArtistId: true,
        title: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!row) throw new NotFoundException(`Artist ${id} not found`);
    return mapArtistRow(row);
  }

  async updateArtist(id: number, body: UpdateArtistBody): Promise<ArtistListItem> {
    const exists = await this.prisma.artist.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Artist ${id} not found`);

    const data: Prisma.ArtistUpdateInput = {};

    // title είναι required στο schema -> δεν επιτρέπουμε null/empty
    if ("title" in body) {
      if (body.title == null) {
        throw new BadRequestException("title cannot be null");
      }
      const t = String(body.title).trim();
      if (!t) throw new BadRequestException("title cannot be empty");
      data.title = t;
    }

    // firstName/lastName είναι String? -> επιτρέπεται null
    if ("firstName" in body) data.firstName = body.firstName ?? null;
    if ("lastName" in body) data.lastName = body.lastName ?? null;

    // imageUrl/bornYear/dieYear αγνοούνται (δεν υπάρχουν στο schema)

    await this.prisma.artist.update({
      where: { id },
      data,
    });

    return this.findOne(id);
  }
}
