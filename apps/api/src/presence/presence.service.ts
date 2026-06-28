import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type OnlinePresenceUserDto = {
  id: number | string;
  label: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string;
  secondsAgo: number;
  guest?: boolean;
};

type PresenceUserRow = {
  userId: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastSessionAt: Date;
  sessionCount: number;
  activeMinutes: number;
  user: {
    id: number;
    email: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    role?: string | null;
  };
};

type GuestPresence = {
  id: string;
  label: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

const DEFAULT_WINDOW_SEC = 180;
const MIN_WINDOW_SEC = 30;
const MAX_WINDOW_SEC = 900;
const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WEEK_MS = 7 * ACTIVE_DAY_MS;

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

function sanitizeGuestLabel(value: unknown): string {
  const label = String(value ?? "").trim();
  if (!label) return "Επισκέπτης";
  return label.slice(0, 40);
}

function mapUserStats(row: PresenceUserRow, now: Date) {
  const user = row.user;
  return {
    id: user.id,
    label: displayLabel(user),
    username: user.username ?? null,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastSessionAt: row.lastSessionAt.toISOString(),
    sessionCount: row.sessionCount,
    activeMinutes: row.activeMinutes,
    secondsAgo: Math.max(0, Math.round((now.getTime() - row.lastSeenAt.getTime()) / 1000)),
  };
}

@Injectable()
export class PresenceService {
  private readonly guestPresence = new Map<string, GuestPresence>();

  constructor(private readonly prisma: PrismaService) {}

  async ping(userId: number) {
    const now = new Date();

    // Single atomic write on the existing heartbeat. No per-page/user history is stored.
    await this.prisma.$executeRaw`
      INSERT INTO "UserPresence" (
        "userId",
        "firstSeenAt",
        "lastSeenAt",
        "lastSessionAt",
        "sessionCount",
        "activeMinutes"
      )
      VALUES (${userId}, ${now}, ${now}, ${now}, 1, 0)
      ON CONFLICT ("userId") DO UPDATE SET
        "activeMinutes" = "UserPresence"."activeMinutes" + CASE
          WHEN EXTRACT(EPOCH FROM (${now} - "UserPresence"."lastSeenAt")) >= 30
           AND EXTRACT(EPOCH FROM (${now} - "UserPresence"."lastSeenAt")) <= 1800
          THEN LEAST(5, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (${now} - "UserPresence"."lastSeenAt")) / 60.0)::int))
          ELSE 0
        END,
        "sessionCount" = "UserPresence"."sessionCount" + CASE
          WHEN ${now} - "UserPresence"."lastSeenAt" > interval '30 minutes' THEN 1
          ELSE 0
        END,
        "lastSessionAt" = CASE
          WHEN ${now} - "UserPresence"."lastSeenAt" > interval '30 minutes' THEN ${now}
          ELSE "UserPresence"."lastSessionAt"
        END,
        "lastSeenAt" = ${now}
    `;

    return { ok: true, lastSeenAt: now.toISOString() };
  }

  async pingGuest(guestId: string, guestLabel?: string) {
    const id = guestId.trim().slice(0, 120);
    const now = new Date();
    const existing = this.guestPresence.get(id);

    this.guestPresence.set(id, {
      id,
      label: sanitizeGuestLabel(guestLabel),
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    });

    return { ok: true, guest: true, lastSeenAt: now.toISOString() };
  }

  private activeGuests(since: Date, take?: number, now = new Date()): OnlinePresenceUserDto[] {
    const staleBefore = new Date(now.getTime() - MAX_WINDOW_SEC * 1000);
    for (const [id, guest] of this.guestPresence.entries()) {
      if (guest.lastSeenAt < staleBefore) this.guestPresence.delete(id);
    }

    return Array.from(this.guestPresence.values())
      .filter((guest) => guest.lastSeenAt >= since)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((guest, index) => ({
        id: `guest:${guest.id}`,
        label: index === 0 ? guest.label : `${guest.label} ${index + 1}`,
        username: null,
        displayName: guest.label,
        avatarUrl: null,
        lastSeenAt: guest.lastSeenAt.toISOString(),
        secondsAgo: Math.max(0, Math.round((now.getTime() - guest.lastSeenAt.getTime()) / 1000)),
        guest: true,
      }));
  }

  async onlineCount(windowSec: number) {
    const n = normalizeWindowSec(windowSec);
    const since = new Date(Date.now() - n * 1000);

    const userCount = await this.prisma.userPresence.count({
      where: { lastSeenAt: { gte: since } },
    });
    const guestCount = this.activeGuests(since).length;
    const count = userCount + guestCount;

    return { windowSec: n, onlineCount: count, count, userCount, guestCount };
  }

  async onlineUsers(params: { windowSec?: number; take?: number } = {}) {
    const windowSec = normalizeWindowSec(params.windowSec);
    const take = normalizeTake(params.take);
    const now = new Date();
    const since = new Date(now.getTime() - windowSec * 1000);

    const [userCount, rows] = await Promise.all([
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
        guest: false,
      };
    });
    const guests = this.activeGuests(since, undefined, now);
    const mergedUsers = [...users, ...guests]
      .sort(
        (a, b) =>
          new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
      )
      .slice(0, take);
    const guestCount = guests.length;
    const count = userCount + guestCount;

    return {
      ok: true,
      windowSec,
      count,
      onlineCount: count,
      userCount,
      guestCount,
      users: mergedUsers,
      generatedAt: now.toISOString(),
    };
  }

  async adminStats() {
    const now = new Date();
    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
    const daySince = new Date(now.getTime() - ACTIVE_DAY_MS);
    const weekSince = new Date(now.getTime() - ACTIVE_WEEK_MS);
    const userSelect = {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
    } satisfies Prisma.UserSelect;

    const [knownUsers, onlineUsers, activeToday, activeWeek, recentUsers, frequentUsers] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.userPresence.count({ where: { lastSeenAt: { gte: onlineSince } } }),
        this.prisma.userPresence.count({ where: { lastSeenAt: { gte: daySince } } }),
        this.prisma.userPresence.count({ where: { lastSeenAt: { gte: weekSince } } }),
        this.prisma.userPresence.findMany({
          orderBy: { lastSeenAt: "desc" },
          take: 12,
          include: { user: { select: userSelect } },
        }),
        this.prisma.userPresence.findMany({
          orderBy: [{ activeMinutes: "desc" }, { sessionCount: "desc" }, { lastSeenAt: "desc" }],
          take: 12,
          include: { user: { select: userSelect } },
        }),
      ]);

    return {
      ok: true,
      generatedAt: now.toISOString(),
      window: {
        onlineMinutes: ONLINE_WINDOW_MS / 60000,
        activeTodayHours: ACTIVE_DAY_MS / 3600000,
        activeWeekDays: ACTIVE_WEEK_MS / ACTIVE_DAY_MS,
      },
      totals: {
        knownUsers,
        onlineUsers,
        activeToday,
        activeWeek,
      },
      recentUsers: recentUsers.map((row) => mapUserStats(row as PresenceUserRow, now)),
      frequentUsers: frequentUsers.map((row) => mapUserStats(row as PresenceUserRow, now)),
    };
  }
}
