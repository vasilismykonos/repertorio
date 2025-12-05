// src/users/users.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "./user-role.enum";
import type { Prisma, User as PrismaUser } from "@prisma/client";

export interface ListUsersOptions {
  search?: string;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
}

type ListUserItem = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: Date;
  createdSongsCount: number;
  createdVersionsCount: number;
  avatarUrl: string | null;
};

// Επεκτείνουμε τον Prisma User με το πεδίο avatarUrl,
// γιατί ο client σου είναι παλιός και δεν το έχει στον τύπο.
type UserWithAvatar = PrismaUser & {
  avatarUrl: string | null;
};

type ListUsersResult = {
  items: ListUserItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Βοηθητικό: φτιάχνει orderBy για πεδία που υπάρχουν στη βάση.
   * Για πεδία counts (createdSongsCount, createdVersionsCount) κάνουμε sort στο JS.
   */
  private buildOrderBy(
    sort: string,
    order: "asc" | "desc",
  ): Prisma.UserOrderByWithRelationInput {
    const dir = order === "desc" ? "desc" : "asc";

    const sortableColumns: Record<
      string,
      keyof Prisma.UserOrderByWithRelationInput
    > = {
      id: "id",
      displayName: "displayName",
      username: "username",
      email: "email",
      role: "role",
      createdAt: "createdAt",
    };

    const key = sortableColumns[sort] || "displayName";

    return {
      [key]: dir,
    };
  }

  /**
   * Μετράει τραγούδια ανά χρήστη από Postgres (Song.createdByUserId).
   */
  private async getSongCountsFromPostgres(
    userIds: number[],
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (userIds.length === 0) return map;

    const groups = await this.prisma.song.groupBy({
      by: ["createdByUserId"],
      where: {
        createdByUserId: { in: userIds },
      },
      _count: { _all: true },
    });

    for (const g of groups) {
      if (g.createdByUserId != null) {
        map.set(g.createdByUserId, g._count._all);
      }
    }

    return map;
  }

  /**
   * Μετράει εκδόσεις ανά χρήστη από Postgres (SongVersion.createdByUserId).
   */
  private async getVersionCountsFromPostgres(
    userIds: number[],
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (userIds.length === 0) return map;

    const groups = await this.prisma.songVersion.groupBy({
      by: ["createdByUserId"],
      where: {
        createdByUserId: { in: userIds },
      },
      _count: { _all: true },
    });

    for (const g of groups) {
      if (g.createdByUserId != null) {
        map.set(g.createdByUserId, g._count._all);
      }
    }

    return map;
  }

  /**
   * Λίστα χρηστών με search, pagination, sorting και counts (τραγούδια/εκδόσεις).
   */
  async listUsers(options: ListUsersOptions): Promise<ListUsersResult> {
    const { search, page, pageSize, sort, order } = options;

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { username: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const total = await this.prisma.user.count({ where });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);

    const orderBy = this.buildOrderBy(sort, order);

    // Εδώ κάνουμε cast σε UserWithAvatar[],
    // ώστε ο TS να επιτρέψει u.avatarUrl, παρότι ο Prisma User δεν το έχει στον τύπο του.
    const users = (await this.prisma.user.findMany({
      where,
      orderBy,
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    })) as UserWithAvatar[];

    const userIds = users.map((u) => u.id);

    const songCountsMap = await this.getSongCountsFromPostgres(userIds);
    const versionCountsMap = await this.getVersionCountsFromPostgres(userIds);

    let items: ListUserItem[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      role: u.role as UserRole,
      createdAt: u.createdAt,
      createdSongsCount: songCountsMap.get(u.id) ?? 0,
      createdVersionsCount: versionCountsMap.get(u.id) ?? 0,
      avatarUrl: u.avatarUrl ?? null,
    }));

    // Αν ο client ζητήσει sort σε counts, το κάνουμε εδώ
    if (sort === "createdSongsCount") {
      items = items.sort((a, b) =>
        order === "desc"
          ? b.createdSongsCount - a.createdSongsCount
          : a.createdSongsCount - b.createdSongsCount,
      );
    } else if (sort === "createdVersionsCount") {
      items = items.sort((a, b) =>
        order === "desc"
          ? b.createdVersionsCount - a.createdVersionsCount
          : a.createdVersionsCount - b.createdVersionsCount,
      );
    }

    return {
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  /**
   * Επιστρέφει έναν χρήστη με τα counts του.
   */
  async getUserById(id: number): Promise<ListUserItem> {
    const user = (await this.prisma.user.findUnique({
      where: { id },
    })) as UserWithAvatar | null;

    if (!user) {
      throw new NotFoundException(`User with id=${id} not found`);
    }

    const [songCountsMap, versionCountsMap] = await Promise.all([
      this.getSongCountsFromPostgres([id]),
      this.getVersionCountsFromPostgres([id]),
    ]);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role as UserRole,
      createdAt: user.createdAt,
      createdSongsCount: songCountsMap.get(id) ?? 0,
      createdVersionsCount: versionCountsMap.get(id) ?? 0,
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  /**
   * Ενημέρωση χρήστη (displayName, role, avatarUrl).
   * Χρησιμοποιούμε "any" για data ώστε να μπορούμε να βάλουμε avatarUrl,
   * παρότι ο Prisma UserUpdateInput δεν το βλέπει ακόμα.
   */
  async updateUser(
    id: number,
    body: {
      displayName?: string;
      role?: UserRole;
      avatarUrl?: string | null;
    },
  ) {
    const data: any = {};

    if (typeof body.displayName === "string") {
      data.displayName = body.displayName;
    }

    if (body.role) {
      data.role = body.role;
    }

    if (typeof body.avatarUrl !== "undefined") {
      data.avatarUrl = body.avatarUrl;
    }

    const updated = (await this.prisma.user.update({
      where: { id },
      data,
    })) as UserWithAvatar;

    return updated;
  }
}
