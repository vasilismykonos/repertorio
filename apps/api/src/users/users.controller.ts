// src/users/users.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { UsersService, ListUsersOptions } from "./users.service";
import { UserRole } from "./user-role.enum";

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
    const options: ListUsersOptions = {
      search: search?.trim() || undefined,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 10,
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
      displayName?: string;
      role?: UserRole;
      avatarUrl?: string | null;
    },
  ) {
    return this.usersService.updateUser(id, body);
  }
}
