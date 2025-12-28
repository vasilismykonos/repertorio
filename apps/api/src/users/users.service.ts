import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";

export interface ListUsersOptions {
  search?: string;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
}

export type ListUserItem = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: Date;
  createdSongsCount: number;
  createdVersionsCount: number;
};

export type ListUsersResult = {
  items: ListUserItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePage(page?: number) {
    return page && page > 0 ? Math.trunc(page) : 1;
  }

  private normalizePageSize(pageSize?: number) {
    const n = pageSize ? Math.trunc(pageSize) : 10;
    if (n < 1) return 10;
    if (n > 200) return 200;
    return n;
  }

  private buildOrderBy(
    sort: string,
    order: "asc" | "desc",
  ): Prisma.UserOrderByWithRelationInput {
    const dir = order === "desc" ? "desc" : "asc";

    const sortable: Record<string, keyof Prisma.UserOrderByWithRelationInput> = {
      id: "id",
      displayName: "displayName",
      username: "username",
      email: "email",
      role: "role",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    };

    const key = sortable[sort] || "displayName";
    return { [key]: dir };
  }

  private async getSongCounts(userIds: number[]) {
    const map = new Map<number, number>();
    if (!userIds.length) return map;

    const rows = await this.prisma.song.groupBy({
      by: ["createdByUserId"],
      where: { createdByUserId: { in: userIds } },
      _count: { _all: true },
    });

    for (const r of rows) {
      if (r.createdByUserId != null) map.set(r.createdByUserId, r._count._all);
    }
    return map;
  }

  private async getVersionCounts(userIds: number[]) {
    const map = new Map<number, number>();
    if (!userIds.length) return map;

    const rows = await this.prisma.songVersion.groupBy({
      by: ["createdByUserId"],
      where: { createdByUserId: { in: userIds } },
      _count: { _all: true },
    });

    for (const r of rows) {
      if (r.createdByUserId != null) map.set(r.createdByUserId, r._count._all);
    }
    return map;
  }

  async listUsers(options: ListUsersOptions): Promise<ListUsersResult> {
    const page = this.normalizePage(options.page);
    const pageSize = this.normalizePageSize(options.pageSize);

    const where: Prisma.UserWhereInput = options.search
      ? {
          OR: [
            { displayName: { contains: options.search, mode: "insensitive" } },
            { email: { contains: options.search, mode: "insensitive" } },
            { username: { contains: options.search, mode: "insensitive" } },
          ],
        }
      : {};

    const total = await this.prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);

    const orderBy = this.buildOrderBy(options.sort, options.order);

    const users = await this.prisma.user.findMany({
      where,
      orderBy,
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    const ids = users.map((u) => u.id);
    const [songCounts, versionCounts] = await Promise.all([
      this.getSongCounts(ids),
      this.getVersionCounts(ids),
    ]);

    let items: ListUserItem[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      avatarUrl: u.avatarUrl ?? null,
      createdAt: u.createdAt,
      createdSongsCount: songCounts.get(u.id) ?? 0,
      createdVersionsCount: versionCounts.get(u.id) ?? 0,
    }));

    // Sorting by computed fields (optional)
    if (options.sort === "createdSongsCount") {
      items = items.sort((a, b) =>
        options.order === "desc"
          ? b.createdSongsCount - a.createdSongsCount
          : a.createdSongsCount - b.createdSongsCount,
      );
    } else if (options.sort === "createdVersionsCount") {
      items = items.sort((a, b) =>
        options.order === "desc"
          ? b.createdVersionsCount - a.createdVersionsCount
          : a.createdVersionsCount - b.createdVersionsCount,
      );
    }

    return { items, total, page: safePage, pageSize, totalPages };
  }

  async getUserById(id: number): Promise<ListUserItem> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException(`User with id=${id} not found`);

    const [songCounts, versionCounts] = await Promise.all([
      this.getSongCounts([id]),
      this.getVersionCounts([id]),
    ]);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: user.createdAt,
      createdSongsCount: songCounts.get(id) ?? 0,
      createdVersionsCount: versionCounts.get(id) ?? 0,
    };
  }

  async updateUser(
    id: number,
    body: { displayName?: string | null; role?: UserRole; avatarUrl?: string | null },
  ) {
    // ensure exists
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`User with id=${id} not found`);

    const data: Prisma.UserUpdateInput = {};

    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.role !== undefined) data.role = body.role;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
