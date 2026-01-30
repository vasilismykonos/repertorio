// apps/api/src/songs/song-singer-tunes.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SongSingerTuneAccessService } from "./SongSingerTuneAccess.service";

type PutSingerTuneInput = {
  id?: number | null;
  title?: string | null;
  tune: string;
};

type UserMini = {
  id: number;
  displayName: string | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
};

type ListScope = "allowed" | "mine";

@Injectable()
export class SongSingerTunesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessSvc: SongSingerTuneAccessService,
  ) {}

  private normalizeTune(v: unknown): string {
    const s = String(v ?? "").trim();
    if (!s) return "";
    return s.endsWith("-") ? s.slice(0, -1) : s;
  }

  private normalizeTitleToString(v: unknown): string {
    const s = String(v ?? "").trim();
    return s;
  }

  private normalizeOptionalTitle(v: unknown): string | undefined {
    if (v === null || typeof v === "undefined") return undefined;
    return this.normalizeTitleToString(v);
  }

  private async getAllowedCreatorIdsForViewer(viewerUserId: number): Promise<{
    allowedCreatorIds: number[];
    canEditByCreatorId: Map<number, boolean>;
  }> {
    const access = await this.accessSvc.getMyAccess(viewerUserId);

    const canEditByCreatorId = new Map<number, boolean>();
    for (const row of access.rows) {
      canEditByCreatorId.set(row.creatorUserId, !!row.canEdit);
    }

    const uniq = new Set<number>([viewerUserId, ...(access.creatorUserIds || [])]);
    return {
      allowedCreatorIds: Array.from(uniq),
      canEditByCreatorId,
    };
  }

  private async loadUsersByIds(ids: number[]): Promise<Map<number, UserMini>> {
    const uniq = Array.from(new Set(ids.filter((x) => Number.isFinite(x) && x > 0)));
    if (!uniq.length) return new Map();

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: {
        id: true,
        displayName: true,
        username: true,
        email: true,
        avatarUrl: true,
      },
    });

    return new Map(users.map((u) => [u.id, u]));
  }

  // ✅ Resolve viewerUserId from viewerEmail (case-insensitive match)
  private async requireViewerUserIdByEmail(viewerEmail: string): Promise<number> {
    const email = String(viewerEmail || "").trim();
    if (!email) throw new BadRequestException("Missing viewer email");

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (!user?.id) throw new BadRequestException("Viewer not found");
    return user.id;
  }

  async listBySongId(
    songId: number,
    viewerUserId: number,
    rowId?: string,
    scope: ListScope = "allowed",
  ) {
    const rowIdNum = rowId ? Number(rowId) : null;
    if (rowId && (!Number.isFinite(rowIdNum) || (rowIdNum as number) <= 0)) {
      throw new BadRequestException("Invalid id");
    }

    const where: any = { songId };

    if (scope === "mine") {
      where.createdByUserId = viewerUserId;
    } else {
      const { allowedCreatorIds } = await this.getAllowedCreatorIdsForViewer(viewerUserId);
      where.createdByUserId = { in: allowedCreatorIds };
    }

    if (rowIdNum) where.id = rowIdNum;

    const rows = await this.prisma.songSingerTune.findMany({
      where,
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        songId: true,
        title: true,
        tune: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const creatorIds = rows
      .map((r) => r.createdByUserId)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);

    const userById = await this.loadUsersByIds(creatorIds);

    return rows.map((r) => {
      const u = r.createdByUserId ? userById.get(r.createdByUserId) : null;
      return {
        id: r.id,
        songId: r.songId,
        title: r.title,
        tune: r.tune,
        createdByUserId: r.createdByUserId,
        createdBy: u
          ? {
              id: u.id,
              displayName: u.displayName,
              username: u.username,
              email: u.email,
              avatarUrl: u.avatarUrl,
            }
          : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
  }

  // ✅ INTERNAL wrappers
  async listBySongIdInternal(
    songId: number,
    viewerEmail: string,
    rowId?: string,
    scope: ListScope = "allowed",
  ) {
    const viewerUserId = await this.requireViewerUserIdByEmail(viewerEmail);
    return this.listBySongId(songId, viewerUserId, rowId, scope);
  }

  async upsertSingerTune(songId: number, viewerUserId: number, input: PutSingerTuneInput) {
    const tune = this.normalizeTune(input?.tune);
    if (!tune) throw new BadRequestException("Missing tune");

    const idNum =
      input?.id === null || typeof input?.id === "undefined" ? null : Number(input.id);

    if (idNum !== null && (!Number.isFinite(idNum) || idNum <= 0)) {
      throw new BadRequestException("Invalid id");
    }

    if (idNum === null) {
      const title = this.normalizeTitleToString(input?.title);

      const created = await this.prisma.songSingerTune.create({
        data: {
          songId,
          tune,
          title,
          createdByUserId: viewerUserId,
        },
        select: { id: true },
      });

      return { ok: true, id: created.id };
    }

    const existing = await this.prisma.songSingerTune.findUnique({
      where: { id: idNum },
      select: { id: true, songId: true, createdByUserId: true },
    });

    if (!existing || existing.songId !== songId) {
      throw new NotFoundException("Singer tune not found");
    }

    const creatorId = existing.createdByUserId;
    if (!creatorId) {
      throw new ForbiddenException("Not allowed");
    }

    if (creatorId !== viewerUserId) {
      const { canEditByCreatorId } = await this.getAllowedCreatorIdsForViewer(viewerUserId);
      const canEdit = canEditByCreatorId.get(creatorId) === true;
      if (!canEdit) throw new ForbiddenException("Not allowed");
    }

    const titleOpt = this.normalizeOptionalTitle(input?.title);

    await this.prisma.songSingerTune.update({
      where: { id: idNum },
      data: {
        tune,
        ...(typeof titleOpt !== "undefined" ? { title: titleOpt } : {}),
      },
      select: { id: true },
    });

    return { ok: true, id: idNum };
  }

  async upsertSingerTuneInternal(songId: number, viewerEmail: string, input: PutSingerTuneInput) {
    const viewerUserId = await this.requireViewerUserIdByEmail(viewerEmail);
    return this.upsertSingerTune(songId, viewerUserId, input);
  }

  async deleteSingerTune(songId: number, viewerUserId: number, rowId?: string) {
    const idNum = Number(rowId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      throw new BadRequestException("Invalid id");
    }

    const existing = await this.prisma.songSingerTune.findUnique({
      where: { id: idNum },
      select: { id: true, songId: true, createdByUserId: true },
    });

    if (!existing || existing.songId !== songId) {
      throw new NotFoundException("Singer tune not found");
    }

    const creatorId = existing.createdByUserId;
    if (!creatorId) throw new ForbiddenException("Not allowed");

    if (creatorId !== viewerUserId) {
      const { canEditByCreatorId } = await this.getAllowedCreatorIdsForViewer(viewerUserId);
      const canEdit = canEditByCreatorId.get(creatorId) === true;
      if (!canEdit) throw new ForbiddenException("Not allowed");
    }

    await this.prisma.songSingerTune.delete({ where: { id: idNum } });
    return { ok: true };
  }

  async deleteSingerTuneInternal(songId: number, viewerEmail: string, rowId?: string) {
    const viewerUserId = await this.requireViewerUserIdByEmail(viewerEmail);
    return this.deleteSingerTune(songId, viewerUserId, rowId);
  }
}
