import { Injectable, NotFoundException } from "@nestjs/common";
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

  // ✅ aliases για συμβατότητα (αν το UI τα περιμένει)
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

  // ✅ canonical
  title: string;

  // ✅ aliases για συμβατότητα (αν το UI διαβάζει άλλο κλειδί)
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

  // ✅ χρήσιμο αν το UI φορτώνει μόνο /items αλλά θέλει τίτλο
  listId: number;
  listTitle: string;
  title: string; // canonical
};

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
   * ✅ “Ανήκει στον χρήστη” = ο χρήστης είναι OWNER στο ListMember.
   */
  private ownershipAclWhere(userId: number) {
    return { members: { some: { userId, role: "OWNER" as const } } };
  }

  /* ---------- index ---------- */

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

    // ✅ Index δείχνει μόνο “δικές μου” (OWNER) — εκτός αν admin.
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

          // ✅ aliases (δεν ενοχλούν, βοηθούν)
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

  /* ---------- detail ---------- */

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
        // ✅ εδώ μένει “member access” (shared lists)
        members: isAdmin ? false : { where: { userId }, select: { role: true } },
        items: {
          orderBy: [{ sortId: "asc" }, { id: "asc" }],
          include: { song: true },
        },
      },
    });

    if (!list) throw new NotFoundException("List not found");

    const role = isAdmin ? "OWNER" : this.computeRole((list as any).members);
    if (!isAdmin && !(list as any).members?.length) {
      throw new NotFoundException("Η λίστα δεν βρέθηκε.");
    }

    const title = list.title ?? "";

    return {
      id: list.id,

      // ✅ canonical
      title,

      // ✅ aliases για όποιο κλειδί περιμένει το UI
      name: title,
      listTitle: title,
      list_title: title,

      groupId: list.groupId ?? null,
      groupTitle: list.group?.title ?? null,
      groupFullTitle: list.group?.fullTitle ?? null,
      marked: list.marked,
      role,
      items: (list.items ?? []).map((it: any) => {
        const songTitle = it.song?.title ?? null;
        const songChords = it.song?.chords ?? null;
        const songLyrics = it.song?.lyrics ?? null;

        const listChords = it.chords ?? null;
        const listLyrics = it.lyrics ?? null;

        return {
          listItemId: it.id,
          listId: it.listId,
          sortId: it.sortId,

          songId: it.songId ?? null,
          title: it.title ?? songTitle,

          chords: listChords ?? songChords ?? null,
          chordsSource: listChords ? "LIST" : songChords ? "SONG" : "NONE",

          lyrics: listLyrics ?? songLyrics ?? null,
          lyricsSource: listLyrics ? "LIST" : songLyrics ? "SONG" : "NONE",
        };
      }),
    };
  }

  /* ---------- items only ---------- */

  async getListItems(params: {
    userId: number;
    listId: number;
    page?: number;
    pageSize?: number;
  }): Promise<ListItemsResponse> {
    const page = this.normalizePage(params.page);
    const pageSize = this.normalizePageSize(params.pageSize);

    // reuse detail (same ACL + ordering)
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
}
