// src/users/users.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('orderby') orderby?: string,
    @Query('order') order?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const pageSizeNumber = pageSize ? parseInt(pageSize, 10) : 10;

    const safeOrderBy =
      orderby === 'displayName' ||
      orderby === 'email' ||
      orderby === 'username' ||
      orderby === 'createdAt'
        ? (orderby as 'displayName' | 'email' | 'username' | 'createdAt')
        : 'displayName';

    const safeOrder = order === 'desc' ? 'desc' : 'asc';

    return this.usersService.listUsers({
      page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
      pageSize:
        Number.isFinite(pageSizeNumber) && pageSizeNumber > 0
          ? pageSizeNumber
          : 10,
      search: search ?? '',
      orderby: safeOrderBy,
      order: safeOrder,
    });
  }
}
