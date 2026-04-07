// apps/api/src/lists/lists.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ListsService } from "./lists.service";

/* =========================
   Helpers
========================= */

function parsePositiveIntOrThrow(value: string, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }
  return n;
}

/**
 * groupId contract (as used by the UI):
 * - "" / undefined => no filter (all)
 * - "null"         => groupId IS NULL (no group)
 * - "123"          => groupId = 123
 */
function parseGroupIdParam(groupIdStr?: string): number | null | undefined {
  if (groupIdStr === undefined) return undefined;

  const v = String(groupIdStr).trim();
  if (v === "" || v === "0") return undefined;

  if (v.toLowerCase() === "null") return null;

  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(
      "groupId must be a positive integer, 'null', or empty",
    );
  }
  return n;
}

function parsePageParam(pageStr?: string): number {
  if (!pageStr) return 1;
  const n = Number(pageStr);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 1;
  return n;
}

function parsePageSizeParam(pageSizeStr?: string): number {
  if (!pageSizeStr) return 50;
  const n = Number(pageSizeStr);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 50;
  return n;
}

function requireUserId(userIdStr?: string): number {
  if (!userIdStr) {
    throw new BadRequestException("Query parameter 'userId' is required.");
  }
  return parsePositiveIntOrThrow(userIdStr, "userId");
}

// ✅ Accepts number OR numeric string
function requirePositiveIntBodyField(value: unknown, fieldName: string): number {
  const n = typeof value === "string" ? Number(value) : (value as number);

  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(
      `Body field '${fieldName}' must be a positive integer.`,
    );
  }
  return n;
}

/**
 * Reorder body parser:
 * Δέχεται:
 *  - [1580, 1581, 1582]
 *  - { orderedItemIds: [..] }
 *  - { itemIds: [..] }
 *  - { ids: [..] }
 *  - { order: [..] }
 */
function parseOrderedIdsFromBody(body: unknown): number[] {
  if (Array.isArray(body)) {
    return body.map((x) => requirePositiveIntBodyField(x, "id"));
  }

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const candidate =
      b.orderedItemIds ?? b.itemIds ?? b.ids ?? b.order ?? b.orderedIds;

    if (Array.isArray(candidate)) {
      return candidate.map((x) => requirePositiveIntBodyField(x, "id"));
    }
  }

  throw new BadRequestException(
    "Body must be an array of item ids or an object containing one of: orderedItemIds/itemIds/ids/order",
  );
}

/* =========================
   DTOs (controller-level)
========================= */

type AddListItemBody = {
  songId: number;
  title?: string;
  chords?: string;
  lyrics?: string;
  notes?: string | null;
  transport?: number;
};

type UpdateListBody = {
  title: string;
  marked?: boolean;
  groupId?: number | null;
};

type CreateListBody = {
  title: string;
  marked?: boolean;
  groupId?: number | null;
};

type CreateGroupBody = {
  title: string;
  fullTitle?: string | null;
};

type UpdateGroupBody = {
  title: string;
  fullTitle?: string | null;
};

// ✅ IMPORTANT: split bodies so TS can enforce correct roles per endpoint.
type UpsertGroupMemberBody = {
  memberUserId?: number;
  email?: string;
  role: "OWNER" | "LIST_EDITOR" | "VIEWER";
};

type UpsertListMemberBody = {
  memberUserId?: number;
  email?: string;
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
};

/* =========================
   Controller
========================= */

@Controller("lists")
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  /* =========================
     Lists Index
  ========================= */

  @Get()
  async getListsIndex(
    @Query("userId") userIdStr?: string,
    @Query("search") search?: string,
    @Query("groupId") groupIdStr?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
    @Query("songId") songIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    const groupId = parseGroupIdParam(groupIdStr);
    const page = parsePageParam(pageStr);
    const pageSize = parsePageSizeParam(pageSizeStr);

    const songId =
      songIdStr && String(songIdStr).trim() !== ""
        ? parsePositiveIntOrThrow(String(songIdStr), "songId")
        : undefined;

    return this.listsService.getListsIndex({
      userId,
      search: search ?? "",
      groupId,
      page,
      pageSize,
      songId,
    });
  }

  /**
   * ✅ CREATE list
   * POST /lists?userId=
   */
  @Post()
  async createList(
    @Query("userId") userIdStr?: string,
    @Body() body?: CreateListBody,
  ) {
    const userId = requireUserId(userIdStr);

    if (!body) {
      throw new BadRequestException("Body is required.");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      throw new BadRequestException("Body field 'title' is required.");
    }

    if (body.marked !== undefined && typeof body.marked !== "boolean") {
      throw new BadRequestException("Body field 'marked' must be boolean.");
    }

    if (body.groupId !== undefined) {
      const v = body.groupId;
      if (v !== null) {
        requirePositiveIntBodyField(v, "groupId");
      }
    }

    return this.listsService.createList({
      userId,
      title,
      marked: body.marked,
      groupId: body.groupId,
    });
  }

  /* =========================
     Groups (ListGroup)
     IMPORTANT: define BEFORE routes with ":id"
  ========================= */

  /**
   * ✅ GET groups index
   * GET /lists/groups?userId=
   */
  @Get("groups")
  async getGroupsIndex(@Query("userId") userIdStr?: string) {
    const userId = requireUserId(userIdStr);
    return this.listsService.getListGroupsIndex({ userId });
  }

  /**
   * ✅ CREATE group
   * POST /lists/groups?userId=
   */
  @Post("groups")
  async createGroup(
    @Query("userId") userIdStr?: string,
    @Body() body?: CreateGroupBody,
  ) {
    const userId = requireUserId(userIdStr);

    if (!body) {
      throw new BadRequestException("Body is required.");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      throw new BadRequestException("Body field 'title' is required.");
    }

    // allow: string | null | undefined
    const fullTitle =
      body.fullTitle === undefined || body.fullTitle === null
        ? body.fullTitle
        : String(body.fullTitle);

    return this.listsService.createListGroup({
      userId,
      title,
      fullTitle,
    });
  }

  /**
   * ✅ UPDATE group
   * PUT /lists/groups/:id?userId=
   */
  @Put("groups/:id")
  async updateGroup(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
    @Body() body?: UpdateGroupBody,
  ) {
    const userId = requireUserId(userIdStr);

    if (!body) {
      throw new BadRequestException("Body is required.");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      throw new BadRequestException("Body field 'title' is required.");
    }

    const fullTitle =
      body.fullTitle === undefined || body.fullTitle === null
        ? body.fullTitle
        : String(body.fullTitle);

    return this.listsService.updateListGroup({
      userId,
      groupId: id,
      title,
      fullTitle,
    });
  }

  /**
   * ✅ DELETE group
   * DELETE /lists/groups/:id?userId=
   */
  @Delete("groups/:id")
  async deleteGroup(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.deleteListGroup({ userId, groupId: id });
  }

  /* =========================
     Group Members
  ========================= */

  /**
   * ✅ GET group members
   * GET /lists/groups/:id/members?userId=
   */
  @Get("groups/:id/members")
  async getGroupMembers(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.getListGroupMembers({ userId, groupId: id });
  }

  /**
   * ✅ UPSERT group member (OWNER/ADMIN only)
   * PUT /lists/groups/:id/members?userId=
   */
    @Put("groups/:id/members")
    async upsertGroupMember(
      @Param("id", ParseIntPipe) id: number,
      @Query("userId") userIdStr?: string,
      @Body() body?: UpsertGroupMemberBody,
    ) {
      const userId = requireUserId(userIdStr);
      if (!body) throw new BadRequestException("Body is required.");

      const allowedRoles = ["OWNER", "LIST_EDITOR", "VIEWER"] as const;
      if (!allowedRoles.includes(body.role)) {
        throw new BadRequestException(
          `Body field 'role' must be one of: ${allowedRoles.join(", ")}`,
        );
      }

      const memberUserId =
        body.memberUserId !== undefined
          ? requirePositiveIntBodyField(body.memberUserId, "memberUserId")
          : null;

      const email = typeof body.email === "string" ? body.email.trim() : "";

      if (!memberUserId && !email) {
        throw new BadRequestException(
          "Provide either body.memberUserId or body.email.",
        );
      }

      return this.listsService.upsertListGroupMember({
        userId,
        groupId: id,
        memberUserId: memberUserId ?? undefined,
        email: email || undefined,
        role: body.role, // ✅ τώρα είναι guaranteed allowed
      });
    }

  /**
   * ✅ DELETE group member (OWNER/ADMIN only)
   * DELETE /lists/groups/:id/members/:memberUserId?userId=
   */
  @Delete("groups/:id/members/:memberUserId")
  async deleteGroupMember(
    @Param("id", ParseIntPipe) id: number,
    @Param("memberUserId", ParseIntPipe) memberUserId: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.deleteListGroupMember({
      userId,
      groupId: id,
      memberUserId,
    });
  }

  /* =========================
     List Detail / Update / Delete
  ========================= */

  @Get(":id")
  async getListDetail(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.getListDetail({ listId: id, userId });
  }

  /* =========================
     List Members
  ========================= */

  /**
   * ✅ GET list members
   * GET /lists/:id/members?userId=
   */
  @Get(":id/members")
  async getListMembers(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.getListMembers({ userId, listId: id });
  }

  /**
   * ✅ UPSERT list member (OWNER/ADMIN only)
   * PUT /lists/:id/members?userId=
   */
  @Put(":id/members")
  async upsertListMember(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
    @Body() body?: UpsertListMemberBody,
  ) {
    const userId = requireUserId(userIdStr);
    if (!body) throw new BadRequestException("Body is required.");

    const role = body.role; // επιτρέπει και SONGS_EDITOR

    const memberUserId =
      body.memberUserId !== undefined
        ? requirePositiveIntBodyField(body.memberUserId, "memberUserId")
        : null;

    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!memberUserId && !email) {
      throw new BadRequestException("Provide either body.memberUserId or body.email.");
    }

    return this.listsService.upsertListMember({
      userId,
      listId: id,
      memberUserId: memberUserId ?? undefined,
      email: email || undefined,
      role,
    });
  }

  /**
   * ✅ DELETE list member (OWNER/ADMIN only)
   * DELETE /lists/:id/members/:memberUserId?userId=
   */
  @Delete(":id/members/:memberUserId")
  async deleteListMember(
    @Param("id", ParseIntPipe) id: number,
    @Param("memberUserId", ParseIntPipe) memberUserId: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.deleteListMember({
      userId,
      listId: id,
      memberUserId,
    });
  }

  /**
   * ✅ UPDATE list (title/marked/groupId)
   * PUT /lists/:id?userId=
   */
  @Put(":id")
  async updateList(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
    @Body() body?: UpdateListBody,
  ) {
    const userId = requireUserId(userIdStr);

    if (!body) {
      throw new BadRequestException("Body is required.");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      throw new BadRequestException("Body field 'title' is required.");
    }

    if (body.marked !== undefined && typeof body.marked !== "boolean") {
      throw new BadRequestException("Body field 'marked' must be boolean.");
    }

    if (body.groupId !== undefined) {
      const v = body.groupId;
      if (v !== null) {
        requirePositiveIntBodyField(v, "groupId");
      }
    }

    return this.listsService.updateList({
      listId: id,
      userId,
      title,
      marked: body.marked,
      groupId: body.groupId,
    });
  }

  /**
   * ✅ DELETE list (owner/admin only)
   * DELETE /lists/:id?userId=
   */
  @Delete(":id")
  async deleteList(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.deleteList({ listId: id, userId });
  }

  /* =========================
     List Items
  ========================= */

  @Get(":id/items")
  async getListItems(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    const page = parsePageParam(pageStr);
    const pageSize = parsePageSizeParam(pageSizeStr);

    return this.listsService.getListItems({
      userId,
      listId: id,
      page,
      pageSize,
    });
  }

  @Post(":id/items")
  async addListItem(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
    @Body() body?: AddListItemBody,
  ) {
    const userId = requireUserId(userIdStr);

    if (!body) {
      throw new BadRequestException("Body is required.");
    }

    const songId = requirePositiveIntBodyField(body.songId, "songId");

    return this.listsService.addListItem({
      listId: id,
      userId,
      songId,
      title: body.title,
      chords: body.chords,
      lyrics: body.lyrics,
      notes: body.notes ?? undefined,
      transport: body.transport,
    });
  }

  @Delete(":id/items/:listItemId")
  async deleteListItem(
    @Param("id", ParseIntPipe) id: number,
    @Param("listItemId", ParseIntPipe) listItemId: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);

    return this.listsService.deleteListItem({
      listId: id,
      listItemId,
      userId,
    });
  }

  /**
   * Save/Reorder
   * PUT /lists/:id/items/reorder?userId=
   */
  @Put(":id/items/reorder")
  async reorderListItems(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
    @Body() body?: unknown,
  ) {
    const userId = requireUserId(userIdStr);

    if (body === undefined) {
      throw new BadRequestException("Body is required.");
    }

    const orderedItemIds = parseOrderedIdsFromBody(body);

    return this.listsService.reorderListItems({
      listId: id,
      userId,
      order: orderedItemIds,
    });
  }
}
