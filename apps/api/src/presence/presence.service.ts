import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async ping(userId: number) {
  await this.prisma.userPresence.upsert({
    where: { userId },
    create: { userId, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() }, // ✅ force UPDATE
  });

  return { ok: true };
}

  async onlineCount(windowSec: number) {
    // Normalise the window to a sensible range (minimum 5s, maximum 24h). Fallback to 300s.
    const n = Number.isFinite(windowSec)
      ? Math.max(5, Math.min(86400, Math.floor(windowSec)))
      : 300;

    // Compute the cutoff time for online presence.
    const since = new Date(Date.now() - n * 1000);

    // Count users whose lastSeenAt is within the window. We intentionally assign
    // the result to a variable named `count` instead of `onlineCount` so we can
    // provide a generic `count` field in the returned payload. Retaining the
    // `onlineCount` property maintains backwards compatibility for any callers
    // expecting the old name.
    const count = await this.prisma.userPresence.count({
      where: { lastSeenAt: { gte: since } },
    });

    // Return both count and onlineCount for compatibility. Consumers should
    // prefer `count` but can fall back to `onlineCount` if needed.
    return { windowSec: n, onlineCount: count, count };
  }
}