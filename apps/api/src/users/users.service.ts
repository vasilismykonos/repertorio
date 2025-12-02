// src/users/users.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "./user-role.enum";

export interface ListUsersOptions {
  search?: string;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Λίστα χρηστών για τη σελίδα /users.
   *
   * - Υποστηρίζει αναζήτηση (search) σε email / displayName.
   * - Υποστηρίζει ταξινόμηση (sort) σε βασικά πεδία χρήστη.
   * - Υποστηρίζει ταξινόμηση σε "songsCount" / "versionsCount"
   *   με in-memory σελιδοποίηση, αφού πρώτα υπολογίσουμε τα counts.
   * - Επιστρέφει πάντα τα πεδία:
   *   createdSongsCount, createdVersionsCount, totalPages.
   */
  async listUsers(options: ListUsersOptions) {
    const { search, page, pageSize } = options;

    // -----------------------------
    // ΦΙΛΤΡΟ (where) χωρίς Prisma.UserWhereInput
    // -----------------------------
    const where: any = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { displayName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    // -----------------------------
    // ΤΑΞΙΝΟΜΗΣΗ (orderBy)
    // -----------------------------
    const allowedSortFields: string[] = [
      "id",
      "email",
      "displayName",
      "createdAt",
      "songsCount",
      "versionsCount",
    ];

    const sortField = allowedSortFields.includes(options.sort)
      ? options.sort
      : "displayName";

    const order: "asc" | "desc" =
      options.order === "desc" ? "desc" : "asc";

    const sortByAggregate =
      sortField === "songsCount" || sortField === "versionsCount";

    // Για sort σε aggregate πεδία, κάνουμε όλη τη ταξινόμηση in-memory.
    const orderBy: any = sortByAggregate ? undefined : { [sortField]: order };

    // -----------------------------
    // Ανάγνωση χρηστών + συνολικός αριθμός
    // -----------------------------
    let baseUsers: any[] = [];
    let total = 0;

    if (sortByAggregate) {
      // Παίρνουμε ΟΛΟΥΣ τους χρήστες που ταιριάζουν στο φίλτρο
      // και θα κάνουμε sort + pagination στη μνήμη.
      baseUsers = await this.prisma.user.findMany({
        where,
      });
      total = baseUsers.length;
    } else {
      const [items, count] = await Promise.all([
        this.prisma.user.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.user.count({ where }),
      ]);
      baseUsers = items;
      total = count;
    }

    if (baseUsers.length === 0) {
      return {
        items: [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    const userIds = baseUsers.map((u) => u.id as number);

    // -----------------------------
    // Υπολογισμός createdSongsCount / createdVersionsCount
    // -----------------------------
    const [songCounts, versionCounts] = await Promise.all([
      this.prisma.song.groupBy({
        by: ["createdByUserId"],
        where: {
          createdByUserId: { in: userIds },
        },
        _count: { _all: true },
      }),
      this.prisma.songVersion.groupBy({
        by: ["createdByUserId"],
        where: {
          createdByUserId: { in: userIds },
        },
        _count: { _all: true },
      }),
    ]);

    const songCountMap = new Map<number, number>();
    for (const row of songCounts) {
      if (row.createdByUserId != null) {
        songCountMap.set(row.createdByUserId as number, row._count._all);
      }
    }

    const versionCountMap = new Map<number, number>();
    for (const row of versionCounts) {
      if (row.createdByUserId != null) {
        versionCountMap.set(row.createdByUserId as number, row._count._all);
      }
    }

    let enriched = baseUsers.map((user) => ({
      ...user,
      createdSongsCount: songCountMap.get(user.id) ?? 0,
      createdVersionsCount: versionCountMap.get(user.id) ?? 0,
    }));

    // -----------------------------
    // Sort σε aggregate πεδία (songsCount / versionsCount)
    // -----------------------------
    if (sortByAggregate) {
      enriched = enriched.sort((a, b) => {
        const aVal =
          sortField === "songsCount"
            ? a.createdSongsCount
            : a.createdVersionsCount;
        const bVal =
          sortField === "songsCount"
            ? b.createdSongsCount
            : b.createdVersionsCount;

        if (aVal === bVal) {
          // Δευτερεύον sort στο displayName για σταθερότητα.
          const aName = (a.displayName || "") as string;
          const bName = (b.displayName || "") as string;
          return aName.localeCompare(bName, "el");
        }

        return order === "asc" ? aVal - bVal : bVal - aVal;
      });

      // Εφαρμογή pagination στη μνήμη
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      enriched = enriched.slice(start, end);
    }

    return {
      items: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Λεπτομέρειες ενός χρήστη για /users/[id].
   * Επιστρέφει επίσης createdSongsCount / createdVersionsCount.
   */
  async getUserById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const [songsCount, versionsCount] = await Promise.all([
      this.prisma.song.count({
        where: { createdByUserId: id },
      }),
      this.prisma.songVersion.count({
        where: { createdByUserId: id },
      }),
    ]);

    return {
      ...user,
      createdSongsCount: songsCount,
      createdVersionsCount: versionsCount,
    };
  }

  /**
   * Ενημέρωση βασικών στοιχείων χρήστη (displayName / role).
   */
  async updateUser(
    id: number,
    body: { displayName?: string; role?: UserRole },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    // -----------------------------
    // Data για update χωρίς Prisma.UserUpdateInput
    // -----------------------------
    const data: any = {};

    if (typeof body.displayName === "string") {
      data.displayName = body.displayName.trim();
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
