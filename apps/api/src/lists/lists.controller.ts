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

function requirePositiveIntBodyField(value: unknown, fieldName: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new BadRequestException(
      `Body field '${fieldName}' must be a positive integer.`,
    );
  }
  return value;
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
   DTOs
========================= */

type AddListItemBody = {
  songId: number;
  title?: string;
  chords?: string;
  lyrics?: string;
  notes?: string | null;
  transport?: number;
};

/* =========================
   Controller
========================= */

@Controller("lists")
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Get()
  async getListsIndex(
    @Query("userId") userIdStr?: string,
    @Query("search") search?: string,
    @Query("groupId") groupIdStr?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    const groupId = parseGroupIdParam(groupIdStr);
    const page = parsePageParam(pageStr);
    const pageSize = parsePageSizeParam(pageSizeStr);

    return this.listsService.getListsIndex({
      userId,
      search: search ?? "",
      groupId,
      page,
      pageSize,
    });
  }

  @Get(":id")
  async getListDetail(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
  ) {
    const userId = requireUserId(userIdStr);
    return this.listsService.getListDetail({ listId: id, userId });
  }

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
    @Body() body?: AddListItemBody, // ✅ optional (fix TS1016)
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
    @Body() body?: unknown, // ✅ optional (fix TS1016)
  ) {
    const userId = requireUserId(userIdStr);

    if (body === undefined) {
      throw new BadRequestException("Body is required.");
    }

    const orderedItemIds = parseOrderedIdsFromBody(body);

    return this.listsService.reorderListItems({
      listId: id,
      userId,
      orderedItemIds,
    });
  }
}
