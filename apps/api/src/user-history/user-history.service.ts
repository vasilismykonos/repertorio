import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_TAKE = 25;
const MAX_TAKE = 80;
const MAX_BATCH_EVENTS = 50;
const MAX_EVENTS_PER_USER = 500;
const EVENT_TYPES = new Set(["SONG_VIEW", "SONG_SEARCH"]);

function normalizeTake(value?: number): number {
  if (!value) return DEFAULT_TAKE;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException("take must be a positive integer");
  }
  return Math.min(value, MAX_TAKE);
}

function truncate(value: unknown, max: number): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeOccurredAt(value: unknown): Date {
  const d = value ? new Date(String(value)) : new Date();
  if (!Number.isFinite(d.getTime())) return new Date();
  const now = Date.now();
  const earliest = now - 1000 * 60 * 60 * 24 * 365;
  const latest = now + 1000 * 60 * 5;
  if (d.getTime() < earliest || d.getTime() > latest) return new Date();
  return d;
}

function compactMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).slice(0, 30)) {
    const val = src[key];
    if (typeof val === "string") out[key] = val.slice(0, 300);
    else if (typeof val === "number" || typeof val === "boolean" || val == null) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

@Injectable()
export class UserHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(params: { userId: number; take?: number }) {
    const take = normalizeTake(params.take);
    const rows = await (this.prisma as any).userHistoryEvent.findMany({
      where: { userId: params.userId },
      orderBy: { occurredAt: "desc" },
      take: Math.min(take * 4, 200),
      include: {
        song: {
          select: {
            id: true,
            title: true,
            firstLyrics: true,
            originalKey: true,
            originalKeySign: true,
            isInstrumental: true,
          },
        },
      },
    });

    const recentSongs: any[] = [];
    const recentSearches: any[] = [];
    const seenSongs = new Set<number>();
    const seenSearches = new Set<string>();

    for (const row of rows) {
      if (row.type === "SONG_VIEW" && row.songId && !seenSongs.has(row.songId)) {
        seenSongs.add(row.songId);
        recentSongs.push({
          id: row.songId,
          title: row.song?.title || row.metadata?.title || `#${row.songId}`,
          firstLyrics: row.song?.firstLyrics ?? null,
          originalKey: row.song?.originalKey ?? null,
          originalKeySign: row.song?.originalKeySign ?? null,
          isInstrumental: row.song?.isInstrumental ?? null,
          path: row.path || `/songs/${row.songId}`,
          occurredAt: row.occurredAt,
        });
      }

      if (row.type === "SONG_SEARCH" && row.searchTerm) {
        const key = `${row.searchTerm.toLocaleLowerCase("el-GR")}::${JSON.stringify(row.metadata || {})}`;
        if (!seenSearches.has(key)) {
          seenSearches.add(key);
          recentSearches.push({
            term: row.searchTerm,
            path: row.path || `/songs?search_term=${encodeURIComponent(row.searchTerm)}`,
            metadata: row.metadata ?? null,
            occurredAt: row.occurredAt,
          });
        }
      }

      if (recentSongs.length >= take && recentSearches.length >= take) break;
    }

    return {
      ok: true,
      recentSongs: recentSongs.slice(0, take),
      recentSearches: recentSearches.slice(0, take),
    };
  }

  async batchForUser(params: { userId: number; events: any[] }) {
    const events = params.events.slice(0, MAX_BATCH_EVENTS);
    const data = events
      .map((event) => {
        const type = String(event?.type || "").trim().toUpperCase();
        if (!EVENT_TYPES.has(type)) return null;

        const songIdRaw = Number(event?.songId);
        const songId =
          type === "SONG_VIEW" && Number.isFinite(songIdRaw) && Number.isInteger(songIdRaw) && songIdRaw > 0
            ? songIdRaw
            : null;
        const searchTerm = type === "SONG_SEARCH" ? truncate(event?.searchTerm, 300) : null;
        if (type === "SONG_VIEW" && !songId) return null;
        if (type === "SONG_SEARCH" && !searchTerm) return null;

        return {
          userId: params.userId,
          type,
          songId,
          searchTerm,
          path: truncate(event?.path, 600),
          metadata: compactMetadata(event?.metadata),
          occurredAt: normalizeOccurredAt(event?.occurredAt),
        };
      })
      .filter(Boolean);

    if (!data.length) return { ok: true, saved: 0 };

    await (this.prisma as any).userHistoryEvent.createMany({
      data,
      skipDuplicates: false,
    });

    void this.trimForUser(params.userId).catch(() => null);

    return { ok: true, saved: data.length };
  }

  private async trimForUser(userId: number) {
    const keep = await (this.prisma as any).userHistoryEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: MAX_EVENTS_PER_USER,
      select: { id: true },
    });
    if (keep.length < MAX_EVENTS_PER_USER) return;
    const keepIds = keep.map((row: any) => row.id);
    await (this.prisma as any).userHistoryEvent.deleteMany({
      where: { userId, id: { notIn: keepIds } },
    });
  }
}
