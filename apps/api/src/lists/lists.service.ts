import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/* =========================
   DTOs
========================= */

export type ListSummaryDto = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
  role: "OWNER" | "EDITOR" | "VIEWER";

  // aliases (UI compatibility)
  name?: string;
  listTitle?: string;
  list_title?: string;
};

export type ListGroupSummaryDto = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
};

export type ListsIndexResponse = {
  items: ListSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
  groups: ListGroupSummaryDto[];
};

export type ListItemDto = {
  listItemId: number;
  listId: number;
  sortId: number;

  songId: number | null;
  title: string | null;

  chords: string | null;
  chordsSource: "LIST" | "SONG" | "NONE";

  lyrics: string | null;
  lyricsSource: "LIST" | "SONG" | "NONE";
};

export type ListDetailDto = {
  id: number;

  // canonical
  title: string;

  // aliases
  name: string;
  listTitle: string;
  list_title: string;

  groupId: number | null;
  groupTitle: string | null;
  groupFullTitle: string | null;

  marked: boolean;
  role: "OWNER" | "EDITOR" | "VIEWER";

  items: ListItemDto[];
};

export type ListItemsResponse = {
  items: ListItemDto[];
  total: number;
  page: number;
  pageSize: number;

  listId: number;
  listTitle: string;
  title: string; // canonical
};

export type DeleteListItemResponse = { ok: true };
export type ReorderListItemsResponse = { ok: true };

/* =========================
   Service
========================= */

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePage(page?: number): number {
    const p = Number(page);
    if (!Number.isFinite(p) || p <= 0) return 1;
    return Math.floor(p);
  }

  private normalizePageSize(pageSize?: number): number {
    const ps = Number(pageSize);
    if (!Number.isFinite(ps) || ps <= 0) return 50;
    const safe = Math.floor(ps);
    return Math.min(Math.max(safe, 1), 200);
  }

  private async getUserContext(userId: number): Promise<{ isAdmin: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const role = user?.role ?? "USER";
    return { isAdmin: role === "ADMIN" };
  }

  private computeRole(
    members?: Array<{ role: "OWNER" | "EDITOR" | "VIEWER" }>,
  ): "OWNER" | "EDITOR" | "VIEWER" {
    const roles = (members ?? []).map((m) => m.role);
    if (roles.includes("OWNER")) return "OWNER";
    if (roles.includes("EDITOR")) return "EDITOR";
    return "VIEWER";
  }

  /**
   * Index ACL: “ανήκει” = OWNER στο ListMember
   */
  private ownershipAclWhere(userId: number) {
    return { members: { some: { userId, role: "OWNER" as const } } };
  }

  private nonEmptyOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  /**
   * Edit ACL:
   * - ADMIN: ok
   * - OWNER/EDITOR: ok
   * - VIEWER: forbidden
   * - not member: 404
   */
  private async assertCanEditListOrThrow(params: {
    listId: number;
    userId: number;
  }): Promise<"OWNER" | "EDITOR" | "ADMIN"> {
    const { listId, userId } = params;
    const { isAdmin } = await this.getUserContext(userId);
    if (isAdmin) return "ADMIN";

    const member = await this.prisma.listMember.findFirst({
      where: { listId, userId },
      select: { role: true },
    });

    if (!member) throw new NotFoundException("Η λίστα δεν βρέθηκε.");
    if (member.role === "VIEWER") {
      throw new ForbiddenException(
        "Δεν έχετε δικαίωμα επεξεργασίας αυτής της λίστας.",
      );
    }

    return member.role; // OWNER | EDITOR
  }

  /* =========================
     Queries
  ========================= */

  async getListsIndex(params: {
    userId: number;
    search?: string;
    groupId?: number | null;
    page?: number;
    pageSize?: number;
  }): Promise<ListsIndexResponse> {
    const { userId, search, groupId } = params;

    const page = this.normalizePage(params.page);
    const pageSize = this.normalizePageSize(params.pageSize);

    const { isAdmin } = await this.getUserContext(userId);

    const filters: any = {};

    if (search && search.trim()) {
      filters.title = { contains: search.trim(), mode: "insensitive" };
    }

    if (groupId === null) {
      filters.groupId = null;
    } else if (typeof groupId === "number") {
      filters.groupId = groupId;
    }

    // Index: μόνο OWNER lists εκτός αν admin
    const acl = isAdmin ? {} : this.ownershipAclWhere(userId);
    const where =
      Object.keys(filters).length > 0 ? { AND: [acl, filters] } : acl;

    const [total, rows, groupsRaw] = await Promise.all([
      this.prisma.list.count({ where }),

      this.prisma.list.findMany({
        where,
        orderBy: [{ marked: "desc" }, { title: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          groupId: true,
          marked: true,
          members: isAdmin
            ? false
            : {
                where: { userId },
                select: { role: true },
              },
        },
      }),

      this.prisma.listGroup.findMany({
        where: isAdmin
          ? undefined
          : {
              lists: {
                some: this.ownershipAclWhere(userId),
              },
            },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        include: {
          lists: {
            where: isAdmin ? undefined : this.ownershipAclWhere(userId),
            select: { id: true },
          },
        },
      }),
    ]);

    const groups: ListGroupSummaryDto[] = (groupsRaw ?? [])
      .map((g) => ({
        id: g.id,
        title: g.title,
        fullTitle: g.fullTitle ?? null,
        listsCount: g.lists.length,
      }))
      .filter((g) => g.listsCount > 0);

    return {
      items: rows.map((r: any) => {
        const t = r.title ?? "";
        return {
          id: r.id,
          title: t,
          groupId: r.groupId ?? null,
          marked: r.marked,
          role: isAdmin ? "OWNER" : this.computeRole(r.members),

          // aliases
          name: t,
          listTitle: t,
          list_title: t,
        };
      }),
      total,
      page,
      pageSize,
      groups,
    };
  }

  async getListDetail(params: {
    listId: number;
    userId: number;
  }): Promise<ListDetailDto> {
    const { listId, userId } = params;
    const { isAdmin } = await this.getUserContext(userId);

    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      include: {
        group: true,
        members: isAdmin ? false : { where: { userId }, select: { role: true } },
        items: {
          orderBy: [{ sortId: "asc" }, { id: "asc" }],
          include: { song: true },
        },
      },
    });

    if (!list) throw new NotFoundException("Η λίστα δεν βρέθηκε.");

    const role = isAdmin ? "OWNER" : this.computeRole((list as any).members);
    if (!isAdmin && !(list as any).members?.length) {
      throw new NotFoundException("Η λίστα δεν βρέθηκε.");
    }

    const title = list.title ?? "";

    return {
      id: list.id,
      title,
      name: title,
      listTitle: title,
      list_title: title,

      groupId: list.groupId ?? null,
      groupTitle: list.group?.title ?? null,
      groupFullTitle: list.group?.fullTitle ?? null,

      marked: list.marked,
      role,

      items: (list.items ?? []).map((it: any) => {
        const songTitle = this.nonEmptyOrNull(it.song?.title);
        const songChords = this.nonEmptyOrNull(it.song?.chords);
        const songLyrics = this.nonEmptyOrNull(it.song?.lyrics);

        const listTitleOv = this.nonEmptyOrNull(it.title);
        const listChordsOv = this.nonEmptyOrNull(it.chords);
        const listLyricsOv = this.nonEmptyOrNull(it.lyrics);

        const effectiveTitle = listTitleOv ?? songTitle ?? null;

        const effectiveChords = listChordsOv ?? songChords ?? null;
        const chordsSource: "LIST" | "SONG" | "NONE" = listChordsOv
          ? "LIST"
          : songChords
            ? "SONG"
            : "NONE";

        const effectiveLyrics = listLyricsOv ?? songLyrics ?? null;
        const lyricsSource: "LIST" | "SONG" | "NONE" = listLyricsOv
          ? "LIST"
          : songLyrics
            ? "SONG"
            : "NONE";

        return {
          listItemId: it.id,
          listId: it.listId,
          sortId: it.sortId,
          songId: it.songId ?? null,
          title: effectiveTitle,
          chords: effectiveChords,
          chordsSource,
          lyrics: effectiveLyrics,
          lyricsSource,
        };
      }),
    };
  }

  async getListItems(params: {
    userId: number;
    listId: number;
    page?: number;
    pageSize?: number;
  }): Promise<ListItemsResponse> {
    const page = this.normalizePage(params.page);
    const pageSize = this.normalizePageSize(params.pageSize);

    const detail = await this.getListDetail({
      listId: params.listId,
      userId: params.userId,
    });

    const total = detail.items.length;
    const start = (page - 1) * pageSize;

    return {
      items: detail.items.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      listId: detail.id,
      title: detail.title,
      listTitle: detail.title,
    };
  }

  /* =========================
     Mutations
  ========================= */

  async addListItem(params: {
    listId: number;
    userId: number;
    songId: number;
    title?: string;
    chords?: string;
    lyrics?: string;
    notes?: string | null;
    transport?: number;
  }): Promise<ListItemDto> {
    const { listId, userId, songId } = params;

    await this.assertCanEditListOrThrow({ listId, userId });

    const song = await this.prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, title: true, chords: true, lyrics: true },
    });
    if (!song) throw new NotFoundException("Το τραγούδι δεν βρέθηκε.");

    const agg = await this.prisma.listItem.aggregate({
      where: { listId },
      _max: { sortId: true },
    });
    const nextSortId = (agg._max.sortId ?? 0) + 1;

    const t = typeof params.title === "string" ? params.title.trim() : "";
    const titleToStore = t.length > 0 ? t : ""; // title is NOT NULL

    const c = typeof params.chords === "string" ? params.chords.trim() : "";
    const chordsToStore = c.length > 0 ? c : null;

    const l = typeof params.lyrics === "string" ? params.lyrics.trim() : "";
    const lyricsToStore = l.length > 0 ? l : null;

    const created = await this.prisma.listItem.create({
      data: {
        listId,
        sortId: nextSortId,
        songId,
        title: titleToStore,
        chords: chordsToStore,
        lyrics: lyricsToStore,
        notes: params.notes ?? null,
        transport: Number.isInteger(params.transport)
          ? (params.transport as number)
          : 0,
      },
      include: { song: true },
    });

    const songTitle = this.nonEmptyOrNull(created.song?.title);
    const songChords = this.nonEmptyOrNull(created.song?.chords);
    const songLyrics = this.nonEmptyOrNull(created.song?.lyrics);

    const listTitleOv = this.nonEmptyOrNull(created.title);
    const listChordsOv = this.nonEmptyOrNull(created.chords);
    const listLyricsOv = this.nonEmptyOrNull(created.lyrics);

    const effectiveTitle = listTitleOv ?? songTitle ?? null;

    const effectiveChords = listChordsOv ?? songChords ?? null;
    const chordsSource: "LIST" | "SONG" | "NONE" = listChordsOv
      ? "LIST"
      : songChords
        ? "SONG"
        : "NONE";

    const effectiveLyrics = listLyricsOv ?? songLyrics ?? null;
    const lyricsSource: "LIST" | "SONG" | "NONE" = listLyricsOv
      ? "LIST"
      : songLyrics
        ? "SONG"
        : "NONE";

    return {
      listItemId: created.id,
      listId: created.listId,
      sortId: created.sortId,
      songId: created.songId ?? null,
      title: effectiveTitle,
      chords: effectiveChords,
      chordsSource,
      lyrics: effectiveLyrics,
      lyricsSource,
    };
  }

  async deleteListItem(params: {
    listId: number;
    listItemId: number;
    userId: number;
  }): Promise<DeleteListItemResponse> {
    const { listId, listItemId, userId } = params;

    await this.assertCanEditListOrThrow({ listId, userId });

    const existing = await this.prisma.listItem.findFirst({
      where: { id: listItemId, listId },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException("List item not found");

    await this.prisma.listItem.delete({
      where: { id: listItemId },
    });

    return { ok: true };
  }

  /**
   * Reorder items by listItem ids
   * - απαιτεί πλήρες order (ίδιο set ids με τα υπάρχοντα items της λίστας)
   */
  async reorderListItems(params: {
    listId: number;
    userId: number;
    order: number[];
  }): Promise<ReorderListItemsResponse> {
    const { listId, userId, order } = params;

    await this.assertCanEditListOrThrow({ listId, userId });

    const existing = await this.prisma.listItem.findMany({
      where: { listId },
      select: { id: true },
      orderBy: [{ sortId: "asc" }, { id: "asc" }],
    });

    const existingIds = existing.map((x) => x.id);
    const existingSet = new Set(existingIds);
    const orderSet = new Set(order);

    if (existingIds.length !== order.length) {
      throw new BadRequestException(
        `Invalid order: expected ${existingIds.length} ids, got ${order.length}.`,
      );
    }

    // same set?
    if (existingSet.size !== orderSet.size) {
      throw new BadRequestException("Invalid order: duplicates detected.");
    }
    for (const id of order) {
      if (!existingSet.has(id)) {
        throw new BadRequestException(
          `Invalid order: item id ${id} does not belong to list ${listId}.`,
        );
      }
    }

    await this.prisma.$transaction(
      order.map((listItemId, idx) =>
        this.prisma.listItem.update({
          where: { id: listItemId },
          data: { sortId: idx + 1 },
        }),
      ),
    );

    return { ok: true };
  }
}
