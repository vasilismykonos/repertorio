import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type OnlinePresenceUserDto = {
  id: number;
  label: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string;
  secondsAgo: number;
};

const DEFAULT_WINDOW_SEC = 180;
const MIN_WINDOW_SEC = 30;
const MAX_WINDOW_SEC = 900;
const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;

function normalizeWindowSec(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_SEC;
  return Math.max(MIN_WINDOW_SEC, Math.min(MAX_WINDOW_SEC, Math.floor(n)));
}

function normalizeTake(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TAKE;
  return Math.max(1, Math.min(MAX_TAKE, Math.floor(n)));
}

function displayLabel(user: {
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  return (
    user.displayName?.trim() ||
    user.username?.trim() ||
    user.email?.trim() ||
    "Χρήστης"
  );
}

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async ping(userId: number) {
    const now = new Date();

    await this.prisma.userPresence.upsert({
      where: { userId },
      create: { userId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });

    return { ok: true, lastSeenAt: now.toISOString() };
  }

  async onlineCount(windowSec: number) {
    const n = normalizeWindowSec(windowSec);
    const since = new Date(Date.now() - n * 1000);

    const count = await this.prisma.userPresence.count({
      where: { lastSeenAt: { gte: since } },
    });

    return { windowSec: n, onlineCount: count, count };
  }

  async onlineUsers(params: { windowSec?: number; take?: number } = {}) {
    const windowSec = normalizeWindowSec(params.windowSec);
    const take = normalizeTake(params.take);
    const now = new Date();
    const since = new Date(now.getTime() - windowSec * 1000);

    const [count, rows] = await Promise.all([
      this.prisma.userPresence.count({
        where: { lastSeenAt: { gte: since } },
      }),
      this.prisma.userPresence.findMany({
        where: { lastSeenAt: { gte: since } },
        orderBy: { lastSeenAt: "desc" },
        take,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);

    const users: OnlinePresenceUserDto[] = rows.map((row) => {
      const user = row.user;
      const secondsAgo = Math.max(
        0,
        Math.round((now.getTime() - row.lastSeenAt.getTime()) / 1000),
      );

      return {
        id: user.id,
        label: displayLabel(user),
        username: user.username ?? null,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
        lastSeenAt: row.lastSeenAt.toISOString(),
        secondsAgo,
      };
    });

    return {
      ok: true,
      windowSec,
      count,
      onlineCount: count,
      users,
      generatedAt: now.toISOString(),
    };
  }
}
