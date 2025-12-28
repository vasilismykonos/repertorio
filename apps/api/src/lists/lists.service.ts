import {
  Injectable,
  NotFoundException,
  ForbiddenException,
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
  title: string;
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
    // προστασία από υπερβολικά μεγάλες τιμές
    const safe = Math.floor(ps);
    return Math.min(Math.max(safe, 1), 200);
  }

  private async getUserContext(userId: number): Promise<{ isAdmin: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    // αν δεν υπάρχει user, συμπεριφέρσου σαν μη-admin (και το ACL θα κόψει)
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

  /* ---------- index ---------- */

  async getListsIndex(params: {
    userId: number;
    search?: string;
    groupId?: number | null; // ✅ επιτρέπει null για "χωρίς ομάδα"
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

    // ✅ groupId filter:
    // - number => groupId = number
    // - null   => groupId IS NULL
    // - undefined => no filter
    if (groupId === null) {
      filters.groupId = null;
    } else if (typeof groupId === "number") {
      filters.groupId = groupId;
    }

    const acl = isAdmin ? {} : { members: { some: { userId } } };
    const where =
      Object.keys(filters).length > 0
        ? { AND: [acl, filters] }
        : acl;

    const [total, rows, groups] = await Promise.all([
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
            : { where: { userId }, select: { role: true } },
        },
      }),

      this.prisma.listGroup.findMany({
        orderBy: [{ title: "asc" }, { id: "asc" }],
        include: {
          lists: {
            where: isAdmin ? undefined : { members: { some: { userId } } },
            select: { id: true },
          },
        },
      }),
    ]);

    return {
      items: rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        groupId: r.groupId,
        marked: r.marked,
        role: isAdmin ? "OWNER" : this.computeRole(r.members),
      })),
      total,
      page,
      pageSize,
      groups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        fullTitle: g.fullTitle ?? null,
        listsCount: g.lists.length,
      })),
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
      // ασφαλής συμπεριφορά: κρύβουμε την ύπαρξη λίστας
      throw new NotFoundException("Η λίστα δεν βρέθηκε.");
    }

    return {
      id: list.id,
      title: list.title,
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
          chordsSource: listChords
            ? "LIST"
            : songChords
            ? "SONG"
            : "NONE",

          lyrics: listLyrics ?? songLyrics ?? null,
          lyricsSource: listLyrics
            ? "LIST"
            : songLyrics
            ? "SONG"
            : "NONE",
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

    // reuse detail (keeps ACL + ordering identical)
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
    };
  }
}
