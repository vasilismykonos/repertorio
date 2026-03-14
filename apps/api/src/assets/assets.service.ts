// apps/api/src/assets/assets.service.ts
import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AssetKind, AssetType, Prisma } from "@prisma/client";

function parseEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: any,
): T[keyof T] | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  return (Object.values(enumObj) as string[]).includes(v) ? (v as any) : null;
}

function toBigIntOrNull(v: any): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function toPositiveIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

type AssetLinkTargetType = "SONG" | "LIST" | "LIST_ITEM" | "LIST_GROUP";

function mapAsset(a: any) {
  return {
    id: a.id,
    kind: a.kind,
    type: a.type,
    title: a.title,
    url: a.url,
    filePath: a.filePath,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes ? String(a.sizeBytes) : null,
    createdAt: a.createdAt,

    // ✅ Links (ταιριάζει με τα include fields σου)
    songs: (a.SongAsset ?? []).map((sa: any) => sa.Song),
    lists: (a.ListAsset ?? []).map((la: any) => la.list),
    listItems: (a.ListItemAsset ?? []).map((lia: any) => lia.listItem),
    listGroups: (a.ListGroupAsset ?? []).map((lga: any) => lga.listGroup),
  };
}

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async search(params: {
    q?: string;
    kind?: string;
    type?: string;

    songId?: number;
    listId?: number;
    listItemId?: number;
    listGroupId?: number;

    unlinked?: boolean;

    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 50)));
    const skip = (page - 1) * pageSize;

    const q = String(params.q ?? "").trim();
    const kindEnum = parseEnumValue(AssetKind, params.kind);
    const typeEnum = parseEnumValue(AssetType, params.type);

    const songId = toPositiveIntOrNull(params.songId);
    const listId = toPositiveIntOrNull(params.listId);
    const listItemId = toPositiveIntOrNull(params.listItemId);
    const listGroupId = toPositiveIntOrNull(params.listGroupId);

    const unlinked = Boolean(params.unlinked);

    const where: Prisma.AssetWhereInput = {};
    const AND: Prisma.AssetWhereInput[] = [];

    if (q) {
      AND.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { url: { contains: q, mode: "insensitive" } },
          { filePath: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (kindEnum) AND.push({ kind: kindEnum as any });
    if (typeEnum) AND.push({ type: typeEnum as any });

    if (songId) AND.push({ SongAsset: { some: { songId } } });
    if (listId) AND.push({ ListAsset: { some: { listId } } });
    if (listItemId) AND.push({ ListItemAsset: { some: { listItemId } } });
    if (listGroupId) AND.push({ ListGroupAsset: { some: { listGroupId } } });

    const hasAnyEntityFilter = Boolean(songId || listId || listItemId || listGroupId);

    if (unlinked && !hasAnyEntityFilter) {
      AND.push({ SongAsset: { none: {} } });
      AND.push({ ListAsset: { none: {} } });
      AND.push({ ListItemAsset: { none: {} } });
      AND.push({ ListGroupAsset: { none: {} } });
    }

    if (AND.length) where.AND = AND;

    const include = {
      SongAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          Song: { select: { id: true, title: true, slug: true } },
        },
      },
      ListAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          list: { select: { id: true, title: true, legacyId: true, groupId: true } },
        },
      },
      ListItemAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
        },
      },
      ListGroupAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } },
        },
      },
    } satisfies Prisma.AssetInclude;

    const [total, items] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        include,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map(mapAsset),
    };
  }

  async getOne(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");

    const a = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        SongAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: { Song: { select: { id: true, title: true, slug: true } } },
        },
        ListAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } },
        },
        ListItemAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: {
            listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
          },
        },
        ListGroupAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
        },
      },
    });

    if (!a) throw new NotFoundException("Asset not found");
    return mapAsset(a);
  }

  async create(data: {
    kind: AssetKind | "FILE" | "LINK";
    type: AssetType | string;
    title?: string | null;
    url?: string | null;
    filePath?: string | null;
    mimeType?: string | null;
    sizeBytes?: string | number | bigint | null;
  }) {
    const kindEnum = parseEnumValue(AssetKind, data.kind);
    if (!kindEnum) throw new BadRequestException("Invalid kind");

    const typeEnum = parseEnumValue(AssetType, data.type) ?? AssetType.GENERIC;

    const created = await this.prisma.asset.create({
      data: {
        kind: kindEnum as any,
        type: typeEnum as any,
        title: data.title ?? null,
        url: data.url ?? null,
        filePath: data.filePath ?? null,
        mimeType: data.mimeType ?? null,
        sizeBytes: toBigIntOrNull(data.sizeBytes),
      },
      include: {
        SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
        ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
        ListItemAsset: {
          include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } },
        },
        ListGroupAsset: {
          include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
        },
      },
    });

    return mapAsset(created);
  }

  async update(
    id: number,
    data: {
      kind: AssetKind | "FILE" | "LINK";
      type: AssetType | string;
      title?: string | null;
      url?: string | null;
      filePath?: string | null;
      mimeType?: string | null;
      sizeBytes?: string | number | bigint | null;
    },
  ) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");

    const kindEnum = parseEnumValue(AssetKind, data.kind);
    if (!kindEnum) throw new BadRequestException("Invalid kind");

    const typeEnum = parseEnumValue(AssetType, data.type) ?? AssetType.GENERIC;

    const exists = await this.prisma.asset.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Asset not found");

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        kind: kindEnum as any,
        type: typeEnum as any,
        title: data.title ?? null,
        url: data.url ?? null,
        filePath: data.filePath ?? null,
        mimeType: data.mimeType ?? null,
        sizeBytes: toBigIntOrNull(data.sizeBytes),
      },
      include: {
        SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
        ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
        ListItemAsset: {
          include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } },
        },
        ListGroupAsset: {
          include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
        },
      },
    });

    return mapAsset(updated);
  }

  async remove(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");
    await this.prisma.asset.delete({ where: { id } });
    return { ok: true };
  }

  /* =========================================================
     NEW: Link / UpdateLink / Unlink (για AssetsController)
  ========================================================= */

  async link(input: {
    assetId: number;
    targetType: AssetLinkTargetType;
    targetId: number;
    label?: string | null;
    sort?: number;
    isPrimary?: boolean;
  }) {
    const assetId = Number(input.assetId);
    const targetId = Number(input.targetId);
    if (!Number.isFinite(assetId) || assetId <= 0) throw new BadRequestException("Invalid assetId");
    if (!Number.isFinite(targetId) || targetId <= 0) throw new BadRequestException("Invalid targetId");

    // validate asset exists
    const a = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!a) throw new NotFoundException("Asset not found");

    const label = input.label ?? null;
    const sort = input.sort ?? 0;
    const isPrimary = input.isPrimary ?? false;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        // clear other primaries for same target
        await this.clearPrimary(tx, input.targetType, targetId);
      }

      switch (input.targetType) {
        case "SONG": {
          // optional: validate song exists
          await tx.song.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("Song not found");
          });

          await tx.songAsset.upsert({
            where: { songId_assetId: { songId: targetId, assetId } },
            create: { songId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        case "LIST": {
          await tx.list.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("List not found");
          });

          await tx.listAsset.upsert({
            where: { listId_assetId: { listId: targetId, assetId } },
            create: { listId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        case "LIST_ITEM": {
          await tx.listItem.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("ListItem not found");
          });

          await tx.listItemAsset.upsert({
            where: { listItemId_assetId: { listItemId: targetId, assetId } },
            create: { listItemId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        case "LIST_GROUP": {
          await tx.listGroup.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("ListGroup not found");
          });

          await tx.listGroupAsset.upsert({
            where: { listGroupId_assetId: { listGroupId: targetId, assetId } },
            create: { listGroupId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        default:
          throw new BadRequestException("Invalid targetType");
      }

      // return updated asset with links
      const full = await tx.asset.findUnique({
        where: { id: assetId },
        include: {
          SongAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { Song: { select: { id: true, title: true, slug: true } } },
          },
          ListAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } },
          },
          ListItemAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: {
              listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
            },
          },
          ListGroupAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
          },
        },
      });

      if (!full) throw new NotFoundException("Asset not found");
      return mapAsset(full);
    });
  }

  async updateLink(input: {
    assetId: number;
    targetType: AssetLinkTargetType;
    targetId: number;
    label?: string | null;
    sort?: number;
    isPrimary?: boolean;
  }) {
    const assetId = Number(input.assetId);
    const targetId = Number(input.targetId);
    if (!Number.isFinite(assetId) || assetId <= 0) throw new BadRequestException("Invalid assetId");
    if (!Number.isFinite(targetId) || targetId <= 0) throw new BadRequestException("Invalid targetId");

    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        await this.clearPrimary(tx, input.targetType, targetId);
      }

      // build partial update
      const data: any = {};
      if (input.label !== undefined) data.label = input.label;
      if (input.sort !== undefined) data.sort = input.sort;
      if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary;

      if (!Object.keys(data).length) {
        // nothing to update, just return asset
        const full = await tx.asset.findUnique({
          where: { id: assetId },
          include: {
            SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
            ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
            ListItemAsset: { include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } } },
            ListGroupAsset: { include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } } },
          },
        });
        if (!full) throw new NotFoundException("Asset not found");
        return mapAsset(full);
      }

      switch (input.targetType) {
        case "SONG":
          await tx.songAsset.update({
            where: { songId_assetId: { songId: targetId, assetId } },
            data,
          });
          break;

        case "LIST":
          await tx.listAsset.update({
            where: { listId_assetId: { listId: targetId, assetId } },
            data,
          });
          break;

        case "LIST_ITEM":
          await tx.listItemAsset.update({
            where: { listItemId_assetId: { listItemId: targetId, assetId } },
            data,
          });
          break;

        case "LIST_GROUP":
          await tx.listGroupAsset.update({
            where: { listGroupId_assetId: { listGroupId: targetId, assetId } },
            data,
          });
          break;

        default:
          throw new BadRequestException("Invalid targetType");
      }

      const full = await tx.asset.findUnique({
        where: { id: assetId },
        include: {
          SongAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { Song: { select: { id: true, title: true, slug: true } } },
          },
          ListAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } },
          },
          ListItemAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: {
              listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
            },
          },
          ListGroupAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
          },
        },
      });

      if (!full) throw new NotFoundException("Asset not found");
      return mapAsset(full);
    });
  }

  async unlink(input: { assetId: number; targetType: AssetLinkTargetType; targetId: number }) {
    const assetId = Number(input.assetId);
    const targetId = Number(input.targetId);
    if (!Number.isFinite(assetId) || assetId <= 0) throw new BadRequestException("Invalid assetId");
    if (!Number.isFinite(targetId) || targetId <= 0) throw new BadRequestException("Invalid targetId");

    await this.prisma.$transaction(async (tx) => {
      switch (input.targetType) {
        case "SONG":
          await tx.songAsset.delete({ where: { songId_assetId: { songId: targetId, assetId } } });
          break;

        case "LIST":
          await tx.listAsset.delete({ where: { listId_assetId: { listId: targetId, assetId } } });
          break;

        case "LIST_ITEM":
          await tx.listItemAsset.delete({ where: { listItemId_assetId: { listItemId: targetId, assetId } } });
          break;

        case "LIST_GROUP":
          await tx.listGroupAsset.delete({ where: { listGroupId_assetId: { listGroupId: targetId, assetId } } });
          break;

        default:
          throw new BadRequestException("Invalid targetType");
      }
    });

    // return asset after unlink
    const full = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
        ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
        ListItemAsset: { include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } } },
        ListGroupAsset: { include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } } },
      },
    });

    if (!full) throw new NotFoundException("Asset not found");
    return mapAsset(full);
  }

  private async clearPrimary(tx: Prisma.TransactionClient, targetType: AssetLinkTargetType, targetId: number) {
    switch (targetType) {
      case "SONG":
        await tx.songAsset.updateMany({ where: { songId: targetId, isPrimary: true }, data: { isPrimary: false } });
        return;
      case "LIST":
        await tx.listAsset.updateMany({ where: { listId: targetId, isPrimary: true }, data: { isPrimary: false } });
        return;
      case "LIST_ITEM":
        await tx.listItemAsset.updateMany({
          where: { listItemId: targetId, isPrimary: true },
          data: { isPrimary: false },
        });
        return;
      case "LIST_GROUP":
        await tx.listGroupAsset.updateMany({
          where: { listGroupId: targetId, isPrimary: true },
          data: { isPrimary: false },
        });
        return;
      default:
        return;
    }
  }
}