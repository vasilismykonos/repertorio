import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';

import { UsersService, type ListUsersOptions } from './users.service';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '10',
    @Query('sort') sort = 'displayName',
    @Query('order') order: 'asc' | 'desc' = 'asc',
  ) {
    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);

    const options: ListUsersOptions = {
      search: search?.trim() || undefined,
      page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
      pageSize:
        Number.isFinite(pageSizeNum) && pageSizeNum > 0 ? pageSizeNum : 10,
      sort,
      order: order === 'desc' ? 'desc' : 'asc',
    };

    return this.usersService.listUsers(options);
  }

  @Post('register-from-auth')
  async registerFromAuth(
    @Body()
    body: {
      email?: string;
      name?: string | null;
      image?: string | null;
    },
  ) {
    if (!body?.email || typeof body.email !== 'string') {
      throw new BadRequestException('email is required');
    }

    return this.usersService.registerFromAuth({
      email: body.email,
      name: body.name ?? null,
      image: body.image ?? null,
    });
  }

  @Get('me')
  async getMe(@Req() req: Request) {
    const email = this.extractEmailFromRequest(req);

    if (!email) {
      throw new UnauthorizedException('Not authenticated');
    }

    return this.usersService.getUserByEmail(email);
  }

  @Get(':id')
  async getUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserById(id);
  }

  @Patch(':id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      displayName?: string | null;
      role?: UserRole;
      avatarUrl?: string | null;
      profile?: unknown | null;
    },
  ) {
    if (
      body.displayName !== undefined &&
      body.displayName !== null &&
      typeof body.displayName !== 'string'
    ) {
      throw new BadRequestException('displayName must be string or null');
    }

    if (
      body.avatarUrl !== undefined &&
      body.avatarUrl !== null &&
      typeof body.avatarUrl !== 'string'
    ) {
      throw new BadRequestException('avatarUrl must be string or null');
    }

    if (body.profile !== undefined) {
      if (body.profile !== null && !isPlainObject(body.profile)) {
        throw new BadRequestException('profile must be an object or null');
      }
    }

    return this.usersService.updateUser(id, body);
  }

  @Delete(':id')
  async deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteUser(id);
  }

  private extractEmailFromRequest(req: Request): string | null {
    const anyReq = req as any;

    const candidates = [
      anyReq?.user?.email,
      anyReq?.auth?.email,
      anyReq?.session?.user?.email,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim().toLowerCase();
      }
    }

    const headerCandidates = [
      req.headers['x-user-email'],
      req.headers['x-auth-request-email'],
      req.headers['x-forwarded-email'],
    ];

    for (const header of headerCandidates) {
      if (typeof header === 'string' && header.trim()) {
        return header.trim().toLowerCase();
      }

      if (
        Array.isArray(header) &&
        typeof header[0] === 'string' &&
        header[0].trim()
      ) {
        return header[0].trim().toLowerCase();
      }
    }

    return null;
  }
}