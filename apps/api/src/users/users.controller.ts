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
import { UsersService } from "./users.service";
import { UserRole } from "./user-role.enum";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(
    @Query("search") search?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "10",
    @Query("orderby") orderby = "displayName",
    @Query("order") order: "asc" | "desc" = "asc",
  ) {
    const pageNumber = Number(page) || 1;
    const pageSizeNumber = Number(pageSize) || 10;

    const sort = orderby || "displayName";

    return this.usersService.listUsers({
      search,
      page: pageNumber,
      pageSize: pageSizeNumber,
      sort,
      order,
    });
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
    },
  ) {
    return this.usersService.updateUser(id, body);
  }
}
