import { Injectable } from "@nestjs/common";
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

type GuestPresence = {
  id: string;
  label: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

type CountRow = {
  count: number | bigint | string;
};

type RawPresenceUserRow = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role?: string | null;
  firstSeenAt?: Date | string | null;
  lastSeenAt: Date | string;
  lastSessionAt?: Date | string | null;
  sessionCount?: number | bigint | string | null;
  activeMinutes?: number | bigint | string | null;
  secondsAgo: number | bigint | string;
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

function toInt(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function isoDate(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  return new Date(0).toISOString();
}

function mapOnlineUser(row: RawPresenceUserRow): OnlinePresenceUserDto {
  return {
    id: row.id,
    label: displayLabel(row),
    username: row.username ?? null,
    displayName: row.displayName ?? null,
    avatarUrl: row.avatarUrl ?? null,
    lastSeenAt: isoDate(row.lastSeenAt),
    secondsAgo: Math.max(0, toInt(row.secondsAgo)),
    guest: false,
  };
}

function mapUserStats(row: RawPresenceUserRow) {
  return {
    id: row.id,
    label: displayLabel(row),
    username: row.username ?? null,
    displayName: row.displayName ?? null,
    email: row.email ?? null,
    avatarUrl: row.avatarUrl ?? null,
    role: row.role ?? null,
    firstSeenAt: isoDate(row.firstSeenAt),
    lastSeenAt: isoDate(row.lastSeenAt),
    lastSessionAt: isoDate(row.lastSessionAt),
    sessionCount: toInt(row.sessionCount ?? 1),
    activeMinutes: toInt(row.activeMinutes ?? 0),
    secondsAgo: Math.max(0, toInt(row.secondsAgo)),
  };
}

@Injectable()
export class PresenceService {
  private readonly guestPresence = new Map<string, GuestPresence>();

  constructor(private readonly prisma: PrismaService) {}

  async ping(userId: number) {
    // UserPresence columns are timestamp-without-time-zone. Keep all heartbeat
    // math inside Postgres local time to avoid false online users from TZ drift.
    await this.prisma.$executeRaw`
      INSERT INTO "UserPresence" (
        "userId",
        "firstSeenAt",
        "lastSeenAt",
        "lastSessionAt",
        "sessionCount",
        "activeMinutes"
      )
      VALUES (${userId}, LOCALTIMESTAMP, LOCALTIMESTAMP, LOCALTIMESTAMP, 1, 0)
      ON CONFLICT ("userId") DO UPDATE SET
        "activeMinutes" = "UserPresence"."activeMinutes" + CASE
          WHEN EXTRACT(EPOCH FROM (LOCALTIMESTAMP - "UserPresence"."lastSeenAt")) >= 30
           AND EXTRACT(EPOCH FROM (LOCALTIMESTAMP - "UserPresence"."lastSeenAt")) <= 1800
          THEN LEAST(5, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (LOCALTIMESTAMP - "UserPresence"."lastSeenAt")) / 60.0)::int))
          ELSE 0
        END,
        "sessionCount" = "UserPresence"."sessionCount" + CASE
          WHEN LOCALTIMESTAMP - "UserPresence"."lastSeenAt" > interval '30 minutes' THEN 1
          ELSE 0
        END,
        "lastSessionAt" = CASE
          WHEN LOCALTIMESTAMP - "UserPresence"."lastSeenAt" > interval '30 minutes' THEN LOCALTIMESTAMP
          ELSE "UserPresence"."lastSessionAt"
        END,
        "lastSeenAt" = LOCALTIMESTAMP
    `;

    return { ok: true, lastSeenAt: new Date().toISOString() };
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

    const userCountRows = await this.prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::int AS count
      FROM "UserPresence"
      WHERE "lastSeenAt" >= LOCALTIMESTAMP - (${n}::int * interval '1 second')
        AND "lastSeenAt" <= LOCALTIMESTAMP + interval '10 seconds'
    `;
    const userCount = toInt(userCountRows[0]?.count);
    const since = new Date(Date.now() - n * 1000);
    const guestCount = this.activeGuests(since).length;
    const count = userCount + guestCount;

    return { windowSec: n, onlineCount: count, count, userCount, guestCount };
  }

  async onlineUsers(params: { windowSec?: number; take?: number } = {}) {
    const windowSec = normalizeWindowSec(params.windowSec);
    const take = normalizeTake(params.take);
    const now = new Date();
    const since = new Date(now.getTime() - windowSec * 1000);

    const [userCountRows, rows] = await Promise.all([
      this.prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::int AS count
        FROM "UserPresence"
        WHERE "lastSeenAt" >= LOCALTIMESTAMP - (${windowSec}::int * interval '1 second')
          AND "lastSeenAt" <= LOCALTIMESTAMP + interval '10 seconds'
      `,
      this.prisma.$queryRaw<RawPresenceUserRow[]>`
        SELECT
          u.id,
          u.email,
          u.username,
          u."displayName",
          u."avatarUrl",
          p."lastSeenAt" AT TIME ZONE current_setting('TimeZone') AS "lastSeenAt",
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (LOCALTIMESTAMP - p."lastSeenAt"))))::int AS "secondsAgo"
        FROM "UserPresence" p
        JOIN "User" u ON u.id = p."userId"
        WHERE p."lastSeenAt" >= LOCALTIMESTAMP - (${windowSec}::int * interval '1 second')
          AND p."lastSeenAt" <= LOCALTIMESTAMP + interval '10 seconds'
        ORDER BY p."lastSeenAt" DESC
        LIMIT ${take}
      `,
    ]);

    const userCount = toInt(userCountRows[0]?.count);
    const users: OnlinePresenceUserDto[] = rows.map(mapOnlineUser);
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
    const onlineSec = Math.round(ONLINE_WINDOW_MS / 1000);
    const daySec = Math.round(ACTIVE_DAY_MS / 1000);
    const weekSec = Math.round(ACTIVE_WEEK_MS / 1000);

    const [knownUsers, onlineRows, activeTodayRows, activeWeekRows, recentUsers, frequentUsers] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS count
          FROM "UserPresence"
          WHERE "lastSeenAt" >= LOCALTIMESTAMP - (${onlineSec}::int * interval '1 second')
            AND "lastSeenAt" <= LOCALTIMESTAMP + interval '10 seconds'
        `,
        this.prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS count
          FROM "UserPresence"
          WHERE "lastSeenAt" >= LOCALTIMESTAMP - (${daySec}::int * interval '1 second')
            AND "lastSeenAt" <= LOCALTIMESTAMP + interval '10 seconds'
        `,
        this.prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS count
          FROM "UserPresence"
          WHERE "lastSeenAt" >= LOCALTIMESTAMP - (${weekSec}::int * interval '1 second')
            AND "lastSeenAt" <= LOCALTIMESTAMP + interval '10 seconds'
        `,
        this.prisma.$queryRaw<RawPresenceUserRow[]>`
          SELECT
            u.id,
            u.email,
            u.username,
            u."displayName",
            u."avatarUrl",
            u.role,
            p."firstSeenAt" AT TIME ZONE current_setting('TimeZone') AS "firstSeenAt",
            p."lastSeenAt" AT TIME ZONE current_setting('TimeZone') AS "lastSeenAt",
            p."lastSessionAt" AT TIME ZONE current_setting('TimeZone') AS "lastSessionAt",
            p."sessionCount",
            p."activeMinutes",
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (LOCALTIMESTAMP - p."lastSeenAt"))))::int AS "secondsAgo"
          FROM "UserPresence" p
          JOIN "User" u ON u.id = p."userId"
          ORDER BY p."lastSeenAt" DESC
          LIMIT 12
        `,
        this.prisma.$queryRaw<RawPresenceUserRow[]>`
          SELECT
            u.id,
            u.email,
            u.username,
            u."displayName",
            u."avatarUrl",
            u.role,
            p."firstSeenAt" AT TIME ZONE current_setting('TimeZone') AS "firstSeenAt",
            p."lastSeenAt" AT TIME ZONE current_setting('TimeZone') AS "lastSeenAt",
            p."lastSessionAt" AT TIME ZONE current_setting('TimeZone') AS "lastSessionAt",
            p."sessionCount",
            p."activeMinutes",
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (LOCALTIMESTAMP - p."lastSeenAt"))))::int AS "secondsAgo"
          FROM "UserPresence" p
          JOIN "User" u ON u.id = p."userId"
          ORDER BY p."activeMinutes" DESC, p."sessionCount" DESC, p."lastSeenAt" DESC
          LIMIT 12
        `,
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
        onlineUsers: toInt(onlineRows[0]?.count),
        activeToday: toInt(activeTodayRows[0]?.count),
        activeWeek: toInt(activeWeekRows[0]?.count),
      },
      recentUsers: recentUsers.map(mapUserStats),
      frequentUsers: frequentUsers.map(mapUserStats),
    };
  }
}
