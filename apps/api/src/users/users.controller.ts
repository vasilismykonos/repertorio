import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { UsersService, type ListUsersOptions } from "./users.service";
import { UserRole } from "@prisma/client";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "10",
    @Query("sort") sort = "displayName",
    @Query("order") order: "asc" | "desc" = "asc",
  ) {
    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);

    const options: ListUsersOptions = {
      search: search?.trim() || undefined,
      page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
      pageSize: Number.isFinite(pageSizeNum) && pageSizeNum > 0 ? pageSizeNum : 10,
      sort,
      order: order === "desc" ? "desc" : "asc",
    };

    return this.usersService.listUsers(options);
  }

  @Get(":id")
  async getUser(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.getUserById(id);
  }

  @Patch(":id")
  async updateUser(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      displayName?: string | null;
      role?: UserRole;
      avatarUrl?: string | null;
    },
  ) {
    // ελάχιστος έλεγχος τύπων (χωρίς να “μαντεύουμε” business rules)
    if (body.displayName !== undefined && body.displayName !== null && typeof body.displayName !== "string") {
      throw new BadRequestException("displayName must be string or null");
    }
    if (body.avatarUrl !== undefined && body.avatarUrl !== null && typeof body.avatarUrl !== "string") {
      throw new BadRequestException("avatarUrl must be string or null");
    }

    return this.usersService.updateUser(id, body);
  }
}
