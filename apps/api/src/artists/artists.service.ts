import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, VersionArtistRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

// ✅ NEW imports for upload
import { promises as fs } from "fs";
import * as path from "path";
import * as crypto from "crypto";

type VersionArtistRoleString = "SINGER_FRONT" | "SINGER_BACK" | "SOLOIST" | "MUSICIAN";

type ArtistListItem = {
  id: number;
  legacyArtistId: number | null;
  title: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
};

type ArtistForEdit = {
  id: number;
  legacyArtistId: number | null;
  title: string;
  firstName: string | null;
  lastName: string | null;

  imageUrl: string | null;
  wikiUrl: string | null;
  sex: string | null;
  biography: string | null;

  bornYear: number | null;
  dieYear: number | null;

  createdAt: Date;
  updatedAt: Date;
};

type SearchArgs = {
  q?: string;
  take: number;
  skip: number;
  roles?: VersionArtistRoleString[];
  role?: VersionArtistRoleString[];
};

type UpdateArtistBody = {
  // title ignored – always computed when possible
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

type FindOrCreateArgs = {
  title: string;
  firstName: string | null;
  lastName: string | null;
  legacyArtistId: number | null;
};

function cleanSpaces(s: unknown): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function toUpperNoTonos(input: unknown): string {
  const trimmed = cleanSpaces(input);
  if (!trimmed) return "";
  const noMarks = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noMarks.toLocaleUpperCase("el-GR");
}

function computeDisplayTitle(firstNameRaw: unknown, lastNameRaw: unknown): string {
  const firstName = toUpperNoTonos(firstNameRaw);
  const lastName = toUpperNoTonos(lastNameRaw);

  if (lastName && firstName) {
    const initial = firstName.charAt(0);
    return `${lastName} ${initial}.`;
  }
  if (lastName) return lastName;
  if (firstName) return firstName;
  return "";
}

function normalizeNullableText(input: unknown): string | null {
  const v = cleanSpaces(input);
  return v ? v : null;
}

function normalizeNullableUrl(input: unknown): string | null {
  const v = cleanSpaces(input);
  return v ? v : null;
}

function normalizeRoles(input: unknown): VersionArtistRole[] {
  const arr = Array.isArray(input) ? input : input ? [input] : [];
  const seen = new Set<string>();

  const allowed: VersionArtistRole[] = [
    "SINGER_FRONT",
    "SINGER_BACK",
    "SOLOIST",
    "MUSICIAN",
  ];

  const out: VersionArtistRole[] = [];
  for (const x of arr) {
    const s = String(x ?? "").trim().toUpperCase();
    if (!s) continue;
    if (seen.has(s)) continue;
    if (!allowed.includes(s as any)) continue;
    seen.add(s);
    out.push(s as VersionArtistRole);
  }
  return out;
}

function mapArtistList(row: {
  id: number;
  legacyArtistId: number | null;
  title: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}): ArtistListItem {
  return {
    id: row.id,
    legacyArtistId: row.legacyArtistId ?? null,
    title: row.title ?? "",
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    imageUrl: row.imageUrl ?? null,
  };
}

function mapArtistForEdit(row: {
  id: number;
  legacyArtistId: number | null;
  title: string;
  firstName: string | null;
  lastName: string | null;

  imageUrl: string | null;
  wikiUrl: string | null;
  sex: string | null;
  biography: string | null;

  bornYear: number | null;
  dieYear: number | null;

  createdAt: Date;
  updatedAt: Date;
}): ArtistForEdit {
  return {
    id: row.id,
    legacyArtistId: row.legacyArtistId ?? null,
    title: row.title ?? "",
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    imageUrl: row.imageUrl ?? null,
    wikiUrl: row.wikiUrl ?? null,
    sex: row.sex ?? null,
    biography: row.biography ?? null,
    bornYear: row.bornYear ?? null,
    dieYear: row.dieYear ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ NEW: uploads config (dir + public base URL)
  private getUploadsConfig() {
    // Server filesystem path
    const uploadsDir =
      process.env.ARTISTS_UPLOAD_DIR || "/var/www/repertorio-uploads/artists";

    // Public URL base that serves the uploads (nginx/static mount)
    const publicBase =
      process.env.PUBLIC_UPLOADS_BASE_URL || "https://api.repertorio.net/uploads";

    return { uploadsDir, publicBase };
  }

  async search(args: SearchArgs) {
    const q = cleanSpaces(args.q ?? "");
    const take = Math.min(200, Math.max(1, Math.trunc(Number(args.take || 20))));
    const skip = Math.max(0, Math.trunc(Number(args.skip || 0)));

    const roles = normalizeRoles((args as any).roles ?? (args as any).role);

    const where: Prisma.ArtistWhereInput = q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    if (roles.length) {
      // σωστό relation name στο δικό σου prisma: Artist.versionCredits
      (where as any).versionCredits = {
        some: { role: { in: roles } },
      };
    }

    const rows = await this.prisma.artist.findMany({
      where,
      take,
      skip,
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
        { title: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        legacyArtistId: true,
        title: true,
        firstName: true,
        lastName: true,
        imageUrl: true,
      },
    });

    return {
      items: rows.map(mapArtistList),
      take,
      skip,
      q,
      roles,
    };
  }

  async findOne(id: number) {
    const row = await this.prisma.artist.findUnique({
      where: { id },
      select: {
        id: true,
        legacyArtistId: true,
        title: true,
        firstName: true,
        lastName: true,

        imageUrl: true,
        wikiUrl: true,
        sex: true,
        biography: true,
        bornYear: true,
        dieYear: true,

        createdAt: true,
        updatedAt: true,
      },
    });

    if (!row) throw new NotFoundException("Artist not found");
    return mapArtistForEdit(row);
  }

  /**
   * Find-or-create by title (case-insensitive).
   * - Αν δώσουν first/last, θα φτιάξουμε title από αυτά (κανόνας σου).
   * - Αν δώσουν μόνο title (legacy/quick create), το δεχόμαστε.
   */
  async findOrCreate(args: FindOrCreateArgs) {
    const rawTitle = cleanSpaces(args.title);
    const firstNameNorm = args.firstName != null ? toUpperNoTonos(args.firstName) : "";
    const lastNameNorm = args.lastName != null ? toUpperNoTonos(args.lastName) : "";

    const computed = computeDisplayTitle(firstNameNorm, lastNameNorm);
    const title = computed || rawTitle;

    if (!title) throw new BadRequestException("title is required");

    const legacyArtistId =
      args.legacyArtistId == null
        ? null
        : Number.isFinite(Number(args.legacyArtistId))
          ? Math.trunc(Number(args.legacyArtistId))
          : null;

    const existing = await this.prisma.artist.findFirst({
      where: { title: { equals: title, mode: "insensitive" } },
      select: {
        id: true,
        legacyArtistId: true,
        title: true,
        firstName: true,
        lastName: true,
        imageUrl: true,
      },
      orderBy: { id: "asc" },
    });

    if (existing) return mapArtistList(existing);

    try {
      const created = await this.prisma.artist.create({
        data: {
          title,
          firstName: firstNameNorm ? firstNameNorm : null,
          lastName: lastNameNorm ? lastNameNorm : null,
          legacyArtistId: legacyArtistId ?? null,
        },
        select: {
          id: true,
          legacyArtistId: true,
          title: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
        },
      });

      return mapArtistList(created);
    } catch (e: any) {
      if (e?.code === "P2002") {
        const again = await this.prisma.artist.findFirst({
          where: { title: { equals: title, mode: "insensitive" } },
          select: {
            id: true,
            legacyArtistId: true,
            title: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
          orderBy: { id: "asc" },
        });
        if (again) return mapArtistList(again);
      }
      throw e;
    }
  }

  /**
   * Update:
   * - firstName/lastName -> ΚΕΦΑΛΑΙΑ ΧΩΡΙΣ ΤΟΝΟΥΣ
   * - title -> παράγεται αυτόματα (όπου γίνεται)
   * - SAFE: αν δεν αλλάζουν ονόματα και δεν μπορεί να παραχθεί title, κρατάμε το υπάρχον title
   */
  async updateArtist(id: number, body: UpdateArtistBody) {
    const existing = await this.prisma.artist.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!existing) throw new NotFoundException("Artist not found");

    const data: Prisma.ArtistUpdateInput = {};

    const nameTouched = ("firstName" in body) || ("lastName" in body);

    const nextFirstName = ("firstName" in body)
      ? toUpperNoTonos(body.firstName)
      : toUpperNoTonos(existing.firstName);

    const nextLastName = ("lastName" in body)
      ? toUpperNoTonos(body.lastName)
      : toUpperNoTonos(existing.lastName);

    if ("firstName" in body) (data as any).firstName = nextFirstName || null;
    if ("lastName" in body) (data as any).lastName = nextLastName || null;

    const computedTitle = computeDisplayTitle(nextFirstName, nextLastName);

    if (computedTitle) {
      (data as any).title = computedTitle;
    } else {
      // Αν ο client προσπαθεί να αλλάξει ονόματα αλλά δεν προκύπτει τίτλος => error
      if (nameTouched) {
        throw new BadRequestException(
          "Συμπλήρωσε τουλάχιστον Επώνυμο (και προαιρετικά Όνομα).",
        );
      }
      // αλλιώς: κρατάμε title ως έχει (ώστε να μπορείς να ενημερώσεις wiki/bio/etc)
      if (!existing.title || !String(existing.title).trim()) {
        throw new BadRequestException(
          "Ο καλλιτέχνης δεν έχει έγκυρο τίτλο. Συμπλήρωσε Επώνυμο/Όνομα.",
        );
      }
    }

    if ("sex" in body) (data as any).sex = normalizeNullableText(body.sex);
    if ("biography" in body) (data as any).biography = normalizeNullableText(body.biography);
    if ("wikiUrl" in body) (data as any).wikiUrl = normalizeNullableUrl(body.wikiUrl);
    if ("imageUrl" in body) (data as any).imageUrl = normalizeNullableUrl(body.imageUrl);

    if ("bornYear" in body) (data as any).bornYear = body.bornYear ?? null;
    if ("dieYear" in body) (data as any).dieYear = body.dieYear ?? null;

    await this.prisma.artist.update({
      where: { id },
      data,
    });

    return this.findOne(id);
  }

  // ✅ NEW: upload image file + update imageUrl
  async uploadArtistImage(id: number, file: Express.Multer.File) {
    const artist = await this.prisma.artist.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!artist) throw new NotFoundException("Artist not found");

    const mime = String(file?.mimetype || "").toLowerCase();
    const ext =
      mime === "image/jpeg" ? "jpg" :
      mime === "image/png" ? "png" :
      mime === "image/webp" ? "webp" :
      null;

    if (!ext) {
      throw new BadRequestException("Μόνο εικόνες JPG/PNG/WebP επιτρέπονται.");
    }

    if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException("Κενό αρχείο.");
    }

    const { uploadsDir, publicBase } = this.getUploadsConfig();

    await fs.mkdir(uploadsDir, { recursive: true });

    const rand = crypto.randomBytes(8).toString("hex");
    const filename = `artist-${id}-${Date.now()}-${rand}.${ext}`;
    const fullPath = path.join(uploadsDir, filename);

    await fs.writeFile(fullPath, file.buffer);

    const imageUrl = `${String(publicBase).replace(/\/$/, "")}/artists/${filename}`;

    await this.prisma.artist.update({
      where: { id },
      data: { imageUrl },
    });

    return { imageUrl };
  }

  async deleteArtist(id: number): Promise<void> {
    const exists = await this.prisma.artist.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Artist not found");

    const versionRolesCount = await this.prisma.songVersionArtist.count({
      where: { artistId: id },
    });

    const songCreditsCount = await this.prisma.songCredit.count({
      where: { artistId: id },
    });

    if (versionRolesCount > 0 || songCreditsCount > 0) {
      throw new BadRequestException(
        "Ο καλλιτέχνης χρησιμοποιείται σε τραγούδια και δεν μπορεί να διαγραφεί.",
      );
    }

    await this.prisma.artist.delete({ where: { id } });
  }
}
