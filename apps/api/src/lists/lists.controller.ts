import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from "@nestjs/common";
import { ListsService } from "./lists.service";

function parsePositiveIntOrThrow(value: string, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
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

@Controller("lists")
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  /**
   * Λίστα λιστών (index)
   * GET /lists?userId=&search=&groupId=&page=&pageSize=
   */
  @Get()
  async getListsIndex(
    @Query("userId") userIdStr?: string,
    @Query("search") search?: string,
    @Query("groupId") groupIdStr?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
  ) {
    if (!userIdStr) {
      throw new BadRequestException("Query parameter 'userId' is required.");
    }

    const userId = parsePositiveIntOrThrow(userIdStr, "userId");
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

  /**
   * Λεπτομέρεια λίστας (όλα τα items)
   */
  @Get(":id")
  async getListDetail(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
  ) {
    if (!userIdStr) {
      throw new BadRequestException("Query parameter 'userId' is required.");
    }

    const userId = parsePositiveIntOrThrow(userIdStr, "userId");

    return this.listsService.getListDetail({
      listId: id,
      userId,
    });
  }

  /**
   * Μόνο τα items (με pagination)
   */
  @Get(":id/items")
  async getListItems(
    @Param("id", ParseIntPipe) id: number,
    @Query("userId") userIdStr?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
  ) {
    if (!userIdStr) {
      throw new BadRequestException("Query parameter 'userId' is required.");
    }

    const userId = parsePositiveIntOrThrow(userIdStr, "userId");
    const page = parsePageParam(pageStr);
    const pageSize = parsePageSizeParam(pageSizeStr);

    return this.listsService.getListItems({
      userId,
      listId: id,
      page,
      pageSize,
    });
  }
}
