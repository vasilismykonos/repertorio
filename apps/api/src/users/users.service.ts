// src/users/users.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "./user-role.enum";
import mysql from "mysql2/promise";
import type { Prisma } from "@prisma/client";

export interface ListUsersOptions {
  search?: string;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
}

type LegacyCounts = {
  songCounts: Map<number, number>;
  versionCounts: Map<number, number>;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Διαβάζει aggregations από την ΠΑΛΙΑ MySQL:
   * - πόσα songs έχει κάθε UserID
   * - πόσα songs_versions έχει κάθε UserID
   *
   * Τα key των map είναι τα ΠΑΛΙΑ UserID (wp_users.ID),
   * τα οποία στην καινούρια βάση αντιστοιχούν στο User.id
   * (σύμφωνα με το migrate-users.ts).
   */
  private async getLegacyCounts(): Promise<LegacyCounts> {
    const {
      OLD_DB_HOST,
      OLD_DB_PORT,
      OLD_DB_USER,
      OLD_DB_PASSWORD,
      OLD_DB_NAME,
    } = process.env;

    const songCounts = new Map<number, number>();
    const versionCounts = new Map<number, number>();

    // Αν δεν υπάρχουν ρυθμίσεις για την παλιά βάση, επιστρέφουμε κενά maps.
    if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
      return { songCounts, versionCounts };
    }

    const port = OLD_DB_PORT ? parseInt(OLD_DB_PORT, 10) : 3306;

    const connection = await mysql.createConnection({
      host: OLD_DB_HOST,
      port,
      user: OLD_DB_USER,
      password: OLD_DB_PASSWORD,
      database: OLD_DB_NAME,
      charset: "utf8mb4_unicode_ci",
    });

    try {
      // 1) Πόσα τραγούδια (songs) έχει φτιάξει ο κάθε χρήστης (UserID)
      const [songRows] = await connection.query<any[]>(`
        SELECT UserID, COUNT(*) AS songsCount
        FROM songs
        WHERE UserID IS NOT NULL AND UserID <> 0
        GROUP BY UserID
      `);

      for (const row of songRows) {
        const userId = Number(row.UserID);
        const count = Number(row.songsCount) || 0;
        if (!Number.isNaN(userId)) {
          songCounts.set(userId, count);
        }
      }

      // 2) Πόσες εκδόσεις (songs_versions) έχει φτιάξει ο κάθε χρήστης (UserID)
      const [versionRows] = await connection.query<any[]>(`
        SELECT UserID, COUNT(*) AS versionsCount
        FROM songs_versions
        WHERE UserID IS NOT NULL AND UserID <> 0
        GROUP BY UserID
      `);

      for (const row of versionRows) {
        const userId = Number(row.UserID);
        const count = Number(row.versionsCount) || 0;
        if (!Number.isNaN(userId)) {
          versionCounts.set(userId, count);
        }
      }
    } finally {
      await connection.end();
    }

    return { songCounts, versionCounts };
  }

  /**
   * Βοηθητική για sort στο Prisma με ασφαλή πεδία.
   */
  private buildOrderBy(
    sort: string,
    order: "asc" | "desc",
  ): Prisma.UserOrderByWithRelationInput {
    const direction: Prisma.SortOrder = order === "desc" ? "desc" : "asc";

    switch (sort) {
      case "email":
        return { email: direction };
      case "username":
        return { username: direction };
      case "createdAt":
        return { createdAt: direction };
      case "displayName":
      default:
        return { displayName: direction };
    }
  }

  /**
   * Λίστα χρηστών με αναζήτηση, ταξινόμηση, σελιδοποίηση
   * και τα πεδία createdSongsCount / createdVersionsCount
   * όπως τα χρειάζεται η σελίδα /users στο Next.js.
   */
  async listUsers(options: ListUsersOptions) {
    const { search, page, pageSize, sort, order } = options;

    let where: Prisma.UserWhereInput | undefined;

    if (search && search.trim() !== "") {
      const s = search.trim();
      where = {
        OR: [
          { displayName: { contains: s } },
          { email: { contains: s } },
          { username: { contains: s } },
        ],
      };
    }

    const orderBy = this.buildOrderBy(sort, order);

    const [users, total] = await Promise.all([
  this.prisma.user.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      wpId: true,          // <-- ΠΡΟΣΘΗΚΗ
      email: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
  }),
  this.prisma.user.count({ where }),
]);


    const { songCounts, versionCounts } = await this.getLegacyCounts();

    const items = users.map((u) => {
  // legacyUserId = παλιό wp_users.ID, αυτό χρησιμοποιούν τα UserID των songs
  const legacyUserId =
    typeof u.wpId === "number" && !Number.isNaN(u.wpId) ? u.wpId : u.id;

  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    role: u.role as UserRole,
    createdAt: u.createdAt, // θα γίνει serialize σε ISO string στο JSON
    createdSongsCount: songCounts.get(legacyUserId) ?? 0,
    createdVersionsCount: versionCounts.get(legacyUserId) ?? 0,
  };
});

    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Επιστροφή ενός χρήστη με τα ίδια πεδία που χρησιμοποιεί
   * η σελίδα /users/[id] (συμπεριλαμβανομένων των counts).
   */
  async getUserById(id: number) {
    const user = await this.prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    wpId: true,           // <-- ΠΡΟΣΘΗΚΗ
    email: true,
    username: true,
    displayName: true,
    role: true,
    createdAt: true,
  },
});


    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const { songCounts, versionCounts } = await this.getLegacyCounts();

    const legacyUserId =
  typeof user.wpId === "number" && !Number.isNaN(user.wpId)
    ? user.wpId
    : user.id;

return {
  id: user.id,
  email: user.email,
  username: user.username,
  displayName: user.displayName,
  role: user.role as UserRole,
  createdAt: user.createdAt,
  createdSongsCount: songCounts.get(legacyUserId) ?? 0,
  createdVersionsCount: versionCounts.get(legacyUserId) ?? 0,
};

  }

  /**
   * Ενημέρωση χρήστη (displayName, role) όπως χρησιμοποιείται από
   * τη σελίδα /users/[id]/edit.
   */
  async updateUser(
    id: number,
    body: { displayName?: string; role?: UserRole },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const data: Prisma.UserUpdateInput = {};

    if (typeof body.displayName === "string") {
      const trimmed = body.displayName.trim();
      data.displayName = trimmed.length > 0 ? trimmed : null;
    }

    if (body.role) {
      data.role = body.role;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });

    return updated;
  }
}
