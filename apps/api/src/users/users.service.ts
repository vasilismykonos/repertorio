// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export type UserListItem = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: Date;
  createdSongsCount: number;
  createdVersionsCount: number;
};

export type ListUsersOptions = {
  page: number;
  pageSize: number;
  search: string;
  orderby: 'displayName' | 'email' | 'username' | 'createdAt';
  order: 'asc' | 'desc';
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(options: ListUsersOptions) {
    const page = Math.max(options.page || 1, 1);
    const take = Math.min(Math.max(options.pageSize || 10, 1), 100);
    const skip = (page - 1) * take;
    const search = options.search?.trim() ?? '';

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const validOrderFields: ListUsersOptions['orderby'][] = [
      'displayName',
      'email',
      'username',
      'createdAt',
    ];
    const orderByField = validOrderFields.includes(options.orderby)
      ? options.orderby
      : 'displayName';
    const orderDirection = options.order === 'desc' ? 'desc' : 'asc';

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { [orderByField]: orderDirection },
        skip,
        take,
        include: {
          _count: {
            select: {
              createdSongs: true,
              createdVersions: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(Math.ceil(total / take), 1);

    const items: UserListItem[] = users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      username: u.username ?? null,
      displayName: u.displayName ?? null,
      createdAt: u.createdAt,
      createdSongsCount: (u as any)._count?.createdSongs ?? 0,
      createdVersionsCount: (u as any)._count?.createdVersions ?? 0,
    }));

    return {
      items,
      total,
      page,
      pageSize: take,
      totalPages,
    };
  }
}
