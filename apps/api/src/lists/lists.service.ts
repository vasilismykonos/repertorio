import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ElasticsearchSongsSyncService } from '../elasticsearch/elasticsearch-songs-sync.service';

/* =========================
   DTOs
========================= */

export type ListSummaryDto = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
  /**
   * Ο ρόλος του χρήστη σε αυτή τη λίστα.  Μετά τον διαχωρισμό
   * δικαιωμάτων επεξεργασίας λίστας/τραγουδιών, τα valid values
   * είναι:
   * - "OWNER": Δημιουργός με πλήρη δικαιώματα.
   * - "LIST_EDITOR": Μπορεί να επεξεργαστεί την ίδια τη λίστα.
   * - "SONGS_EDITOR": Μπορεί να επεξεργαστεί μόνο τα τραγούδια της λίστας.
   * - "VIEWER": Μπορεί να δει τη λίστα (χωρίς δικαίωμα επεξεργασίας).
   */
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";

  // ✅ lightweight count από DB (COUNT ListItem)
  itemsCount: number;

  // aliases (UI compatibility)
  name?: string;
  listTitle?: string;
  list_title?: string;
  memberRoleCounts: {
  OWNER: number;
  LIST_EDITOR: number;
  SONGS_EDITOR: number;
  VIEWER: number;
};
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

  // facets for pills
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
  /**
   * Ο ρόλος του τρέχοντος χρήστη στη λίστα. Βλέπε ListSummaryDto.role
   * για τη λίστα των πιθανών τιμών.
   */
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";

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

export type AddListItemResponse = ListItemDto & {
  itemsCount: number;
};

export type DeleteListItemResponse = { ok: true };
export type ReorderListItemsResponse = { ok: true };

export type CreateListResponse = ListDetailDto;
export type UpdateListResponse = ListDetailDto;
export type DeleteListResponse = { ok: true; id: number };

export type ListMemberDto = {
  userId: number;
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
  email: string | null;
  username: string | null;
  displayName: string | null;
};

export type ListMembersResponse = {
  items: ListMemberDto[];
};

export type ListGroupMemberDto = {
  userId: number;
  role: "OWNER" | "LIST_EDITOR" | "VIEWER";
  email: string | null;
  username: string | null;
  displayName: string | null;
};

export type ListGroupMembersResponse = {
  items: ListGroupMemberDto[];
};

/* =========================
   Groups DTOs
========================= */

export type ListGroupDto = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
  /**
   * Ο ρόλος του χρήστη στην ομάδα. Επιτρέπονται μόνο τα LIST_EDITOR
   * και VIEWER σε επίπεδο ομάδας, εκτός του OWNER.
   */
  role: "OWNER" | "LIST_EDITOR" | "VIEWER";
};

export type ListGroupsIndexResponse = {
  items: ListGroupDto[];
};

/* =========================
   Service
========================= */

type ListRole = "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
type GroupRole = "OWNER" | "LIST_EDITOR" | "VIEWER";

// legacy values we may still have in DB
type LegacyRole = "EDITOR" | "LIST_VIEWER" | "SONGS_VIEWER";

@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly esSync?: ElasticsearchSongsSyncService,
  ) {}

  /* =========================
     Helpers
  ========================= */

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

  private nonEmptyOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  private async getUserContext(userId: number): Promise<{ isAdmin: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const role = user?.role ?? "USER";
    return { isAdmin: role === "ADMIN" };
  }

  private normalizeListRole(role: any): ListRole {
    // legacy -> new
    if (role === "EDITOR") return "LIST_EDITOR";
    if (role === "LIST_VIEWER" || role === "SONGS_VIEWER") return "VIEWER";

    // new roles
    if (
      role === "OWNER" ||
      role === "LIST_EDITOR" ||
      role === "SONGS_EDITOR" ||
      role === "VIEWER"
    ) {
      return role;
    }

    // safest fallback
    return "VIEWER";
  }

  private normalizeGroupRole(role: any): GroupRole {
    // groups never support SONGS_EDITOR; map legacy viewer/editor accordingly
    if (role === "EDITOR") return "LIST_EDITOR";
    if (role === "LIST_VIEWER" || role === "SONGS_VIEWER") return "VIEWER";

    if (role === "OWNER" || role === "LIST_EDITOR" || role === "VIEWER") return role;

    // safest fallback
    return "VIEWER";
  }

  private computeHighestListRole(
    members?: Array<{ role: ListRole | LegacyRole }>,
  ): ListRole {
    const roles: ListRole[] = [];
    for (const m of members ?? []) roles.push(this.normalizeListRole(m.role));
    if (roles.includes("OWNER")) return "OWNER";
    if (roles.includes("LIST_EDITOR")) return "LIST_EDITOR";
    if (roles.includes("SONGS_EDITOR")) return "SONGS_EDITOR";
    return "VIEWER";
  }

  private computeHighestGroupRole(
    members?: Array<{ role: GroupRole | LegacyRole }>,
  ): GroupRole {
    const roles: GroupRole[] = [];
    for (const m of members ?? []) roles.push(this.normalizeGroupRole(m.role));
    if (roles.includes("OWNER")) return "OWNER";
    if (roles.includes("LIST_EDITOR")) return "LIST_EDITOR";
    return "VIEWER";
  }

  /**
   * View ACL:
   * Ο χρήστης βλέπει λίστες μόνο αν είναι μέλος της λίστας (OWNER, LIST_EDITOR,
   * SONGS_EDITOR ή VIEWER).  Ισχύει και για ADMIN, όπως ζήτησες.
   */
  private viewAclWhere(userId: number) {
    return { members: { some: { userId } } };
  }

  private async ensureListExistsOrThrow(listId: number) {
    const exists = await this.prisma.list.findUnique({
      where: { id: listId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Η λίστα δεν βρέθηκε.");
  }

  private async ensureGroupExistsOrThrow(groupId: number) {
    const exists = await this.prisma.listGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Η ομάδα δεν βρέθηκε.");
  }

  /**
   * Edit ACL (lists metadata):
   * - ADMIN: ok (αν η λίστα υπάρχει)
   * - OWNER ή LIST_EDITOR: ok
   * - SONGS_EDITOR/VIEWER: forbidden
   * - not member: 404
   */
  private async assertCanEditListOrThrow(params: {
    listId: number;
    userId: number;
  }): Promise<"OWNER" | "LIST_EDITOR" | "ADMIN"> {
    const { listId, userId } = params;

    const { isAdmin } = await this.getUserContext(userId);
    if (isAdmin) {
      await this.ensureListExistsOrThrow(listId);
      return "ADMIN";
    }

    const member = await this.prisma.listMember.findFirst({
      where: { listId, userId },
      select: { role: true },
    });

    if (!member) throw new NotFoundException("Η λίστα δεν βρέθηκε.");

    const role = this.normalizeListRole(member.role);

    if (role !== "OWNER" && role !== "LIST_EDITOR") {
      throw new ForbiddenException(
        "Δεν έχετε δικαίωμα επεξεργασίας αυτής της λίστας.",
      );
    }

    return role;
  }

  /**
   * Edit ACL (list songs):
   * - ADMIN: ok (αν η λίστα υπάρχει)
   * - OWNER/LIST_EDITOR/SONGS_EDITOR: ok
   * - VIEWER: forbidden
   * - not member: 404
   */
  private async assertCanEditSongsOrThrow(params: {
    listId: number;
    userId: number;
  }): Promise<"OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "ADMIN"> {
    const { listId, userId } = params;

    const { isAdmin } = await this.getUserContext(userId);
    if (isAdmin) {
      await this.ensureListExistsOrThrow(listId);
      return "ADMIN";
    }

    const member = await this.prisma.listMember.findFirst({
      where: { listId, userId },
      select: { role: true },
    });
    if (!member) throw new NotFoundException("Η λίστα δεν βρέθηκε.");

    const role = this.normalizeListRole(member.role);

    if (role !== "OWNER" && role !== "LIST_EDITOR" && role !== "SONGS_EDITOR") {
      throw new ForbiddenException(
        "Δεν έχετε δικαίωμα επεξεργασίας των τραγουδιών της λίστας.",
      );
    }

    return role as any;
  }

  /**
   * Manage ACL (list members):
   * - ADMIN: ok (αν η λίστα υπάρχει)
   * - OWNER: ok
   * - LIST_EDITOR: ok, αλλά με περιορισμούς (δεν αγγίζει OWNER)
   * - SONGS_EDITOR/VIEWER: forbidden
   * - not member: 404
   */
  private async assertCanManageListMembersOrThrow(params: {
    listId: number;
    userId: number;
  }): Promise<"OWNER" | "LIST_EDITOR" | "ADMIN"> {
    const { listId, userId } = params;

    const { isAdmin } = await this.getUserContext(userId);
    if (isAdmin) {
      await this.ensureListExistsOrThrow(listId);
      return "ADMIN";
    }

    const member = await this.prisma.listMember.findFirst({
      where: { listId, userId },
      select: { role: true },
    });

    if (!member) throw new NotFoundException("Η λίστα δεν βρέθηκε.");

    const role = this.normalizeListRole(member.role);

    if (role === "OWNER") return "OWNER";
    if (role === "LIST_EDITOR") return "LIST_EDITOR";

    throw new ForbiddenException(
      "Δεν έχετε δικαίωμα διαχείρισης των μελών της λίστας.",
    );
  }

  /* =========================
     Queries (Lists)
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

  const filters: any = {};

  if (search && search.trim()) {
    filters.title = { contains: search.trim(), mode: "insensitive" };
  }

  if (groupId === null) {
    filters.groupId = null;
  } else if (typeof groupId === "number") {
    filters.groupId = groupId;
  }

  const acl = this.viewAclWhere(userId);
  const where = Object.keys(filters).length > 0 ? { AND: [acl, filters] } : acl;

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

        // role για τον viewer (όπως είχες)
        members: { where: { userId }, select: { role: true } },

        _count: { select: { items: true } },
      },
    }),

    this.prisma.listGroup.findMany({
      where: {
        lists: { some: this.viewAclWhere(userId) },
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      include: {
        lists: {
          where: this.viewAclWhere(userId),
          select: { id: true },
        },
      },
    }),
  ]);

  const listIds = (rows ?? []).map((r: any) => r.id);

  // ✅ aggregation: counts ανά (listId, role)
  const memberCountsRaw = listIds.length
    ? await this.prisma.listMember.groupBy({
        by: ["listId", "role"],
        where: { listId: { in: listIds } },
        _count: { _all: true },
      })
    : [];

  // map: listId -> role -> count
  const countsByListId = new Map<
    number,
    { OWNER: number; LIST_EDITOR: number; SONGS_EDITOR: number; VIEWER: number }
  >();

  function emptyCounts() {
    return { OWNER: 0, LIST_EDITOR: 0, SONGS_EDITOR: 0, VIEWER: 0 };
  }

  for (const row of memberCountsRaw as any[]) {
    const listId = row.listId as number;
    const role = row.role as "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
    const c = Number(row._count?._all ?? 0) || 0;

    const current = countsByListId.get(listId) ?? emptyCounts();
    if (role in current) current[role] = c;
    countsByListId.set(listId, current);
  }

  const groups: ListGroupSummaryDto[] = (groupsRaw ?? [])
    .map((g: any) => ({
      id: g.id,
      title: g.title,
      fullTitle: g.fullTitle ?? null,
      listsCount: (g.lists ?? []).length,
    }))
    .filter((g) => g.listsCount > 0);

  return {
    items: (rows ?? []).map((r: any) => {
      const t = r.title ?? "";
      const memberRoleCounts = countsByListId.get(r.id) ?? emptyCounts();

      return {
        id: r.id,
        title: t,
        groupId: r.groupId ?? null,
        marked: !!r.marked,
        role: this.computeHighestListRole(r.members),
        itemsCount: r._count?.items ?? 0,

        // ✅ NEW
        memberRoleCounts,

        name: t,
        listTitle: t,
        list_title: t,
      };
    }),
    total: total ?? 0,
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

    // ✅ View access = membership (όπως όλοι)
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      include: {
        group: true,
        members: { where: { userId }, select: { role: true } },
        items: {
          orderBy: [{ sortId: "asc" }, { id: "asc" }],
          include: { song: true },
        },
      },
    });

    if (!list) throw new NotFoundException("Η λίστα δεν βρέθηκε.");
    if (!(list as any).members?.length) {
      // ✅ αν δεν είσαι member, για εσένα “δεν υπάρχει”
      throw new NotFoundException("Η λίστα δεν βρέθηκε.");
    }

    const role = this.computeHighestListRole((list as any).members);
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

      marked: !!list.marked,
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
     Mutations (Lists)
  ========================= */

  /**
   * ✅ Create list (title/marked/groupId) + OWNER membership
   */
  async createList(params: {
    userId: number;
    title: string;
    marked?: boolean;
    groupId?: number | null;
  }): Promise<CreateListResponse> {
    const { userId, title, marked, groupId } = params;

    const nextTitle = String(title ?? "").trim();
    if (!nextTitle) throw new BadRequestException("Ο τίτλος είναι υποχρεωτικός.");

    const created = await this.prisma.$transaction(async (tx) => {
      const list = await tx.list.create({
        data: {
          title: nextTitle,
          marked: marked ?? false,
          groupId: groupId ?? null,
        },
        select: { id: true },
      });

      await tx.listMember.create({
        data: {
          listId: list.id,
          userId,
          role: "OWNER",
        },
      });

      return list;
    });

    return this.getListDetail({ listId: created.id, userId });
  }

  async addListItem(params: {
    listId: number;
    userId: number;
    songId: number;
    title?: string;
    chords?: string;
    lyrics?: string;
    notes?: string | null;
    transport?: number;
  }): Promise<AddListItemResponse> {
    const { listId, userId, songId } = params;

    // Για επεξεργασία των τραγουδιών επιτρέπουμε και τους SONGS_EDITOR
    await this.assertCanEditSongsOrThrow({ listId, userId });

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

    // title is NOT NULL in DB (στο δικό σου schema)
    const t = typeof params.title === "string" ? params.title.trim() : "";
    const titleToStore = t.length > 0 ? t : "";

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
        transport: Number.isInteger(params.transport) ? (params.transport as number) : 0,
      },
      include: { song: true },
    });

    // effective fields (LIST overrides SONG)
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

    const itemsCount = await this.prisma.listItem.count({ where: { listId } });

    await this.esSync?.upsertSong(songId);

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
      itemsCount,
    };
  }

  async deleteListItem(params: {
    listId: number;
    listItemId: number;
    userId: number;
  }): Promise<DeleteListItemResponse> {
    const { listId, listItemId, userId } = params;

    await this.assertCanEditSongsOrThrow({ listId, userId });

    const existing = await this.prisma.listItem.findFirst({
      where: { id: listItemId, listId },
      select: { id: true, songId: true },
    });

    if (!existing) throw new NotFoundException("List item not found");

    await this.prisma.listItem.delete({ where: { id: listItemId } });

    if (typeof existing.songId === 'number' && existing.songId > 0) {
      await this.esSync?.upsertSong(existing.songId);
    }

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

    await this.assertCanEditSongsOrThrow({ listId, userId });

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

  /**
   * ✅ Update list fields (title/marked/groupId)
   */
  async updateList(params: {
    listId: number;
    userId: number;
    title: string;
    marked?: boolean;
    groupId?: number | null;
  }): Promise<UpdateListResponse> {
    const { listId, userId, title, marked, groupId } = params;

    await this.assertCanEditListOrThrow({ listId, userId });

    const nextTitle = String(title ?? "").trim();
    if (!nextTitle) throw new BadRequestException("Ο τίτλος είναι υποχρεωτικός.");

    await this.prisma.list.update({
      where: { id: listId },
      data: {
        title: nextTitle,
        ...(marked !== undefined ? { marked: !!marked } : {}),
        ...(groupId !== undefined ? { groupId } : {}),
      },
    });

    return this.getListDetail({ listId, userId });
  }

  /**
   * ✅ Delete list (only OWNER or ADMIN)
   * Διαγράφει και τα children (items + members) σε transaction
   */
  async deleteList(params: {
    listId: number;
    userId: number;
  }): Promise<DeleteListResponse> {
    const { listId, userId } = params;

    const role = await this.assertCanEditListOrThrow({ listId, userId });

    if (role !== "OWNER" && role !== "ADMIN") {
      throw new ForbiddenException("Μόνο ο ιδιοκτήτης μπορεί να διαγράψει τη λίστα.");
    }

    await this.ensureListExistsOrThrow(listId);

    const affectedSongIds = await this.prisma.listItem.findMany({
      where: { listId, songId: { not: null } },
      select: { songId: true },
      distinct: ['songId'],
    });

    await this.prisma.$transaction([
      this.prisma.listItem.deleteMany({ where: { listId } }),
      this.prisma.listMember.deleteMany({ where: { listId } }),
      this.prisma.list.delete({ where: { id: listId } }),
    ]);

    for (const row of affectedSongIds) {
      if (typeof row.songId === 'number' && row.songId > 0) {
        await this.esSync?.upsertSong(row.songId);
      }
    }

    return { ok: true, id: listId };
  }

  /* =========================
     Groups (ListGroup)
  ========================= */

  private async requireGroupRoleOrThrow(params: {
    userId: number;
    groupId: number;
  }): Promise<GroupRole> {
    const member = await this.prisma.listGroupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: params.groupId,
          userId: params.userId,
        },
      },
      select: { role: true },
    });

    if (!member) throw new NotFoundException("Η ομάδα δεν βρέθηκε.");
    return this.normalizeGroupRole(member.role);
  }

  /**
   * Manage ACL (group members):
   * - ADMIN: ok (αν η ομάδα υπάρχει)
   * - OWNER: ok
   * - LIST_EDITOR/VIEWER: forbidden
   * - not member: 404
   */
  private async assertCanManageGroupMembersOrThrow(params: {
    userId: number;
    groupId: number;
  }): Promise<"OWNER" | "ADMIN"> {
    const { userId, groupId } = params;

    const { isAdmin } = await this.getUserContext(userId);
    if (isAdmin) {
      await this.ensureGroupExistsOrThrow(groupId);
      return "ADMIN";
    }

    const member = await this.prisma.listGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true },
    });

    if (!member) throw new NotFoundException("Η ομάδα δεν βρέθηκε.");

    const role = this.normalizeGroupRole(member.role);
    if (role !== "OWNER") {
      throw new ForbiddenException(
        "Μόνο ο ιδιοκτήτης μπορεί να διαχειριστεί τους χρήστες της ομάδας.",
      );
    }

    return "OWNER";
  }

  private toMemberDto(u: any, role: any): ListMemberDto {
    return {
      userId: Number(u?.id),
      role: this.normalizeListRole(role),
      email: u?.email ?? null,
      username: u?.username ?? null,
      displayName: u?.displayName ?? null,
    };
  }

  private async resolveUserIdFromInput(input: {
    memberUserId?: number;
    email?: string;
  }): Promise<number> {
    if (input.memberUserId && Number.isFinite(input.memberUserId)) {
      const n = Number(input.memberUserId);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BadRequestException("Invalid memberUserId.");
      }
      return n;
    }

    const email = String(input.email ?? "").trim();
    if (!email) throw new BadRequestException("Provide memberUserId or email.");

    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });

    if (!user) throw new BadRequestException("Ο χρήστης δεν βρέθηκε.");
    return user.id;
  }

  /* =========================
     List Members
  ========================= */

  async getListMembers(params: {
    userId: number;
    listId: number;
  }): Promise<ListMembersResponse> {
    const { userId, listId } = params;

    // View members list only if user can view the list (member) OR admin.
    const { isAdmin } = await this.getUserContext(userId);
    if (!isAdmin) {
      const me = await this.prisma.listMember.findFirst({
        where: { listId, userId },
        select: { role: true },
      });
      if (!me) throw new NotFoundException("Η λίστα δεν βρέθηκε.");
    } else {
      await this.ensureListExistsOrThrow(listId);
    }

    const rows = await this.prisma.listMember.findMany({
      where: { listId },
      orderBy: [{ role: "asc" }, { userId: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    return {
      items: (rows ?? []).map((r: any) => this.toMemberDto(r.user, r.role)),
    };
  }

  async upsertListMember(params: {
    userId: number;
    listId: number;
    memberUserId?: number;
    email?: string;
    role: ListRole; // "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER"
  }): Promise<ListMembersResponse> {
    const { userId, listId } = params;
    const role = this.normalizeListRole(params.role);

    const managerRole = await this.assertCanManageListMembersOrThrow({ listId, userId });

    const targetUserId = await this.resolveUserIdFromInput({
      memberUserId: params.memberUserId,
      email: params.email,
    });

    await this.ensureListExistsOrThrow(listId);

    // Remove restrictions: allow LIST_EDITOR to assign OWNER and modify any member (including the owner)
    // Note: previously, LIST_EDITOR could not assign the OWNER role or modify the existing owner.
    // By removing these checks, list editors gain the same capabilities as owners for managing members.

    // Fetch existing membership to determine if the user already exists,
    // but do not restrict based on the existing role.
    const existingMembership = await this.prisma.listMember.findFirst({
      where: { listId, userId: targetUserId },
      select: { role: true },
    });

    await this.prisma.listMember.upsert({
      where: { listId_userId: { listId, userId: targetUserId } },
      update: { role },
      create: { listId, userId: targetUserId, role },
    });

    return this.getListMembers({ userId, listId });
  }

  async deleteListMember(params: {
    userId: number;
    listId: number;
    memberUserId: number;
  }): Promise<ListMembersResponse> {
    const { userId, listId, memberUserId } = params;

    const managerRole = await this.assertCanManageListMembersOrThrow({ listId, userId });

    const n = Number(memberUserId);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      throw new BadRequestException("Invalid memberUserId.");
    }

    await this.ensureListExistsOrThrow(listId);

    // Allow LIST_EDITOR to remove any member, including the owner.
    // Previously, list editors were prevented from removing the owner from the list.
    // This change aligns list editors' permissions with owners.

    // No restrictions based on the target member's role.

    await this.prisma.listMember.deleteMany({
      where: { listId, userId: n },
    });

    return this.getListMembers({ userId, listId });
  }

  /* =========================
     Group Members
  ========================= */

  async getListGroupMembers(params: {
    userId: number;
    groupId: number;
  }): Promise<ListGroupMembersResponse> {
    const { userId, groupId } = params;

    // Viewer must be a member OR admin.
    const { isAdmin } = await this.getUserContext(userId);
    if (!isAdmin) {
      const me = await this.prisma.listGroupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { role: true },
      });
      if (!me) throw new NotFoundException("Η ομάδα δεν βρέθηκε.");
    } else {
      await this.ensureGroupExistsOrThrow(groupId);
    }

    const rows = await this.prisma.listGroupMember.findMany({
      where: { groupId },
      orderBy: [{ role: "asc" }, { userId: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    return {
      items: (rows ?? []).map((r: any) => ({
        userId: Number(r.user?.id),
        role: this.normalizeGroupRole(r.role),
        email: r.user?.email ?? null,
        username: r.user?.username ?? null,
        displayName: r.user?.displayName ?? null,
      })),
    };
  }

  async upsertListGroupMember(params: {
    userId: number;
    groupId: number;
    memberUserId?: number;
    email?: string;
    role: GroupRole; // "OWNER" | "LIST_EDITOR" | "VIEWER"
  }): Promise<ListGroupMembersResponse> {
    const { userId, groupId } = params;
    const role = this.normalizeGroupRole(params.role);

    await this.assertCanManageGroupMembersOrThrow({ userId, groupId });

    const targetUserId = await this.resolveUserIdFromInput({
      memberUserId: params.memberUserId,
      email: params.email,
    });

    await this.ensureGroupExistsOrThrow(groupId);

    await this.prisma.listGroupMember.upsert({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      update: { role },
      create: { groupId, userId: targetUserId, role },
    });

    return this.getListGroupMembers({ userId, groupId });
  }

  async deleteListGroupMember(params: {
    userId: number;
    groupId: number;
    memberUserId: number;
  }): Promise<ListGroupMembersResponse> {
    const { userId, groupId, memberUserId } = params;

    await this.assertCanManageGroupMembersOrThrow({ userId, groupId });

    const n = Number(memberUserId);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      throw new BadRequestException("Invalid memberUserId.");
    }

    await this.ensureGroupExistsOrThrow(groupId);

    // Do not allow removing the OWNER membership of the group
    const existing = await this.prisma.listGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: n } },
      select: { role: true },
    });

    if (existing) {
      const existingRole = this.normalizeGroupRole(existing.role);
      if (existingRole === "OWNER") {
        throw new ForbiddenException(
          "Δεν μπορείτε να αφαιρέσετε τον ιδιοκτήτη από την ομάδα. Μεταβιβάστε πρώτα την ιδιοκτησία.",
        );
      }
    }

    await this.prisma.listGroupMember.deleteMany({
      where: { groupId, userId: n },
    });

    return this.getListGroupMembers({ userId, groupId });
  }

  async getListGroupsIndex(params: {
    userId: number;
  }): Promise<ListGroupsIndexResponse> {
    const { userId } = params;

    // ✅ groups που ο user είναι member (ακόμα κι αν έχουν 0 lists)
    const rows = await this.prisma.listGroup.findMany({
      where: { members: { some: { userId } } },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      include: {
        members: { where: { userId }, select: { role: true } },
        // visible lists for that user
        lists: { where: this.viewAclWhere(userId), select: { id: true } },
      },
    });

    return {
      items: (rows ?? []).map((g: any) => ({
        id: g.id,
        title: g.title,
        fullTitle: g.fullTitle ?? null,
        listsCount: (g.lists ?? []).length,
        role: this.computeHighestGroupRole(g.members),
      })),
    };
  }

  async createListGroup(params: {
    userId: number;
    title: string;
    fullTitle?: string | null;
  }): Promise<ListGroupDto> {
    const { userId } = params;

    const title = String(params.title ?? "").trim();
    if (!title) throw new BadRequestException("Ο τίτλος ομάδας είναι υποχρεωτικός.");

    const fullTitle =
      params.fullTitle === null || params.fullTitle === undefined
        ? null
        : String(params.fullTitle).trim() || null;

    const created = await this.prisma.listGroup.create({
      data: {
        title,
        fullTitle,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
      include: {
        members: { where: { userId }, select: { role: true } },
        lists: { where: this.viewAclWhere(userId), select: { id: true } },
      },
    });

    return {
      id: created.id,
      title: created.title,
      fullTitle: created.fullTitle ?? null,
      listsCount: (created.lists ?? []).length,
      role: this.computeHighestGroupRole(created.members),
    };
  }

  async updateListGroup(params: {
    userId: number;
    groupId: number;
    title: string;
    fullTitle?: string | null;
  }): Promise<ListGroupDto> {
    const { userId, groupId } = params;

    const role = await this.requireGroupRoleOrThrow({ userId, groupId });
    if (role !== "OWNER" && role !== "LIST_EDITOR") {
      throw new ForbiddenException("Δεν έχετε δικαίωμα επεξεργασίας αυτής της ομάδας.");
    }

    const title = String(params.title ?? "").trim();
    if (!title) throw new BadRequestException("Ο τίτλος ομάδας είναι υποχρεωτικός.");

    const fullTitle =
      params.fullTitle === null || params.fullTitle === undefined
        ? null
        : String(params.fullTitle).trim() || null;

    const updated = await this.prisma.listGroup.update({
      where: { id: groupId },
      data: { title, fullTitle },
      include: {
        members: { where: { userId }, select: { role: true } },
        lists: { where: this.viewAclWhere(userId), select: { id: true } },
      },
    });

    return {
      id: updated.id,
      title: updated.title,
      fullTitle: updated.fullTitle ?? null,
      listsCount: (updated.lists ?? []).length,
      role: this.computeHighestGroupRole(updated.members),
    };
  }

  async deleteListGroup(params: {
    userId: number;
    groupId: number;
  }): Promise<{ ok: true; id: number }> {
    const { userId, groupId } = params;

    const role = await this.requireGroupRoleOrThrow({ userId, groupId });
    if (role !== "OWNER") {
      throw new ForbiddenException("Μόνο ο ιδιοκτήτης μπορεί να διαγράψει την ομάδα.");
    }

    // ✅ ΣΗΜΑΝΤΙΚΟ: check σε ΟΛΕΣ τις λίστες (όχι με ACL),
    // γιατί αλλιώς μπορεί να υπάρχουν lists άλλων users που κρατάνε FK.
    const listsCount = await this.prisma.list.count({
      where: { groupId },
    });

    if (listsCount > 0) {
      throw new BadRequestException(
        "Δεν γίνεται διαγραφή ομάδας που έχει λίστες. Μετακίνησε πρώτα τις λίστες εκτός ομάδας.",
      );
    }

    // ✅ πρώτα delete children (members), μετά parent (group)
    await this.prisma.$transaction([
      this.prisma.listGroupMember.deleteMany({ where: { groupId } }),
      this.prisma.listGroup.delete({ where: { id: groupId } }),
    ]);

    return { ok: true, id: groupId };
  }
}