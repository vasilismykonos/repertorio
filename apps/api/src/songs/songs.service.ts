// apps/api/src/songs/songs.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  AssetKind,
  AssetType,
  SongCreditRole,
  SongStatus,
  VersionArtistRole,
} from '@prisma/client';

// ✅ NEW
import { ElasticsearchSongsSyncService } from '../elasticsearch/elasticsearch-songs-sync.service';
import {
  rankSongDuplicateCandidates,
  SongDuplicateCandidateDto,
} from './song-duplicate-candidates';

type TagDto = {
  id: number;
  title: string;
  slug: string;
};

type SongAssetDto = {
  id: number;
  kind: AssetKind;
  type: AssetType;
  title: string | null;
  url: string | null;
  filePath: string | null;
  mimeType: string | null;
  sizeBytes: string | null;

  label: string | null;
  sort: number;
  isPrimary: boolean;
};

type SongVersionDto = {
  id: number;
  year: number | null;
  singerFront: string | null;
  singerBack: string | null;
  solist: string | null;
  youtubeSearch: string | null;

  // ✅ source-of-truth για edit: arrays of NEW Artist IDs
  singerFrontIds: number[];
  singerBackIds: number[];
  solistIds: number[];
};

type SongDetailDto = {
  id: number;
  legacySongId: number | null;
  hasScore: boolean;
  isInstrumental: boolean;

  title: string;
  firstLyrics: string | null;
  lyrics: string | null;

  // legacy/compat
  characteristics: string | null;

  // ✅ NEW (EXPLICIT μέσω join tables)
  tags: TagDto[];
  assets: SongAssetDto[];

  originalKey: string | null;
  originalKeySign: '+' | '-' | null;
  chords: string | null;
  status: string | null;

  categoryId: number | null;
  rythmId: number | null;
  makamId: number | null;

  categoryTitle: string | null;
  composerName: string | null;
  lyricistName: string | null;

  credits: {
    composers: Array<{
      creditId: number;
      artistId: number;
      title: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    lyricists: Array<{
      creditId: number;
      artistId: number;
      title: string;
      firstName: string | null;
      lastName: string | null;
    }>;
  };

  rythmTitle: string | null;

  basedOnSongId: number | null;
  basedOnSongTitle: string | null;

  views: number;

  createdByUserId: number | null;
  createdByDisplayName: string | null;

  versions: SongVersionDto[];
};

type RecommendedSongDto = {
  id: number;
  title: string;
  firstLyrics: string | null;
  categoryId: number | null;
  categoryTitle: string | null;
  rythmId: number | null;
  rythmTitle: string | null;
  originalKey: string | null;
  originalKeySign: '+' | '-' | null;
  views: number | null;
  hasChords: boolean;
  hasScore: boolean;
  isInstrumental: boolean;
  tags: string[];
  reasons: string[];
};

type SongRecommendationsResponse = {
  items: RecommendedSongDto[];
  profile: {
    sourceSongCount: number;
    recentSongCount: number;
    listSongCount: number;
    searchTerms: string[];
    categoryTitles: string[];
    rythmTitles: string[];
    tagTitles: string[];
  };
  suggestions: Array<{
    label: string;
    description: string;
    filters: Record<string, string>;
  }>;
};

type OfflineSongChangesDto = {
  serverTime: string;
  items: any[];
  removedIds: number[];
  hasMore: boolean;
  nextSince: string | null;
};

function buildArtistDisplayName(a: {
  title: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const full = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
  return full || a.title;
}

/**
 * Παράγει firstLyrics από τους στίχους:
 * - παίρνει την ΠΡΩΤΗ μη-κενή γραμμή
 * - κάνει trim
 * - επιστρέφει null αν δεν υπάρχει περιεχόμενο
 */
function extractFirstLyricsFromLyrics(
  lyrics: string | null | undefined,
): string | null {
  if (lyrics === null || lyrics === undefined) return null;
  const text = String(lyrics);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t) return t.length > 300 ? t.slice(0, 300) : t;
  }
  return null;
}

function toNullableBigIntString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  try {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number' && Number.isFinite(v))
      return BigInt(v).toString();
    if (typeof v === 'string' && v.trim() !== '')
      return BigInt(v.trim()).toString();
    return null;
  } catch {
    return null;
  }
}

function toNullableBigInt(v: unknown): bigint | null {
  if (v === null || v === undefined) return null;
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return BigInt(v);
    if (typeof v === 'string' && v.trim() !== '') return BigInt(v.trim());
    return null;
  } catch {
    throw new BadRequestException('Invalid sizeBytes (must be integer/bigint)');
  }
}

function parseCsvNames(input: unknown): string[] {
  const s = (input ?? '').toString();
  const parts = s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  // uniq (case-insensitive), preserve order
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = p.toLocaleLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function normalizeArtistIds(input: unknown): number[] {
  // Accept: number[] | string(CSV) | number | null
  if (input === null || input === undefined) return [];

  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [input];

  const out: number[] = [];
  const seen = new Set<number>();

  for (const r of raw) {
    const n = typeof r === 'number' ? r : Number(String(r).trim());
    if (!Number.isFinite(n)) continue;
    const id = Math.trunc(n);
    if (id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

type UpdateSongBody = {
  title?: string;
  firstLyrics?: string | null;
  lyrics?: string | null;
  isInstrumental?: boolean | null;

  // legacy/compat
  characteristics?: string | null;

  originalKey?: string | null;
  originalKeySign?: '+' | '-' | null;
  chords?: string | null;

  status?: SongStatus;
  categoryId?: number | null;
  rythmId?: number | null;
  basedOnSongId?: number | null;

  highestVocalNote?: string | null;

  createdByUserId?: number | null;

  // ✅ NEW (tags replace-all)
  tagIds?: number[] | null;

  // ✅ NEW (assets replace-all)
  assets?:
    | Array<{
        id?: number;
        kind: AssetKind;
        type?: AssetType;
        title?: string | null;
        url?: string | null;
        filePath?: string | null;
        mimeType?: string | null;
        sizeBytes?: string | number | bigint | null;

        // relation metadata
        label?: string | null;
        sort?: number | null;
        isPrimary?: boolean | null;
      }>
    | null;

  // ✅ NEW (discographies/versions replace-all)
  versions?:
    | Array<{
        id?: number | null;
        year?: number | string | null;
        youtubeSearch?: string | null;

        // backward compatible: comma-separated names
        singerFrontNames?: string | null;
        singerBackNames?: string | null;
        solistNames?: string | null;

        // ✅ preferred: ids (array or CSV string)
        singerFrontIds?: number[] | string | null;
        singerBackIds?: number[] | string | null;
        solistIds?: number[] | string | null;
      }>
    | null;
};

function slugifySongTitle(input: string): string {
  const trimmed = input.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'song';

  // remove tonos/diacritics
  const noMarks = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // keep greek+latin+digits+space+dash
  const slug = noMarks
    .toLocaleLowerCase('el-GR')
    .replace(/[^a-z0-9\u0370-\u03ff\u1f00-\u1fff\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'song';
}

async function ensureUniqueSongSlugTx(tx: any, base: string): Promise<string> {
  let candidate = base;
  let i = 2;

  while (
    await tx.song.findFirst({
      where: { slug: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${i++}`;
  }

  return candidate;
}

function inferOriginalKeySignFromChords(chords: unknown): '+' | '-' | null {
  if (typeof chords !== 'string' || chords.trim() === '') return null;

  const re =
    /([Νν][το]|[Ρρ][ε]|[Μμ][ι]|[Φφ][α]|[Σσ][ολ]|[Λλ][α]|[Σσ][ι])(#?)([+\-])?/g;

  let m: RegExpExecArray | null = null;
  let last: RegExpExecArray | null = null;

  while ((m = re.exec(chords)) !== null) last = m;

  // δεν βρέθηκε καθόλου νότα με +/- => NULL
  if (!last) return null;

  // αν το τελευταίο match δεν είχε ρητό πρόσημο, πάλι NULL
  if (last[3] !== '+' && last[3] !== '-') return null;

  return last[3] === '-' ? '-' : '+';
}

function normalizeBooleanInput(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return null;
}

function normalizeAssetFileNameLike(
  ...parts: Array<string | null | undefined>
): string {
  return parts
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .join(' ')
    .trim()
    .toLowerCase();
}

function hasMxlExtension(value: string | null | undefined): boolean {
  if (!value) return false;
  const clean = value.split('?')[0].split('#')[0].trim().toLowerCase();
  return clean.endsWith('.mxl');
}

function hasMxlMimeType(value: string | null | undefined): boolean {
  if (!value) return false;
  const mt = value.trim().toLowerCase();
  return (
    mt.includes('application/vnd.recordare.musicxml') ||
    mt.includes('application/vnd.recordare.musicxml+xml') ||
    mt.includes('application/x-mxl') ||
    mt.includes('musicxml') ||
    mt.includes('/mxl')
  );
}

function isScoreAssetLike(input: {
  title?: string | null;
  url?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
}): boolean {
  if (hasMxlMimeType(input.mimeType)) return true;
  if (hasMxlExtension(input.filePath)) return true;
  if (hasMxlExtension(input.url)) return true;
  if (hasMxlExtension(input.title)) return true;

  const combined = normalizeAssetFileNameLike(
    input.title,
    input.url,
    input.filePath,
  );
  return combined.includes('.mxl');
}

@Injectable()
export class SongsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly esSync?: ElasticsearchSongsSyncService,
  ) {}

  async findDuplicateCandidates(args: {
    title?: string | null;
    firstLyrics?: string | null;
    lyrics?: string | null;
    excludeSongId?: number | null;
    take?: number | string | null;
  }): Promise<{ items: SongDuplicateCandidateDto[] }> {
    const takeRaw = Math.trunc(Number(args.take ?? 8));
    const take = Math.min(Math.max(Number.isFinite(takeRaw) ? takeRaw : 8, 1), 12);
    const excludeSongId =
      typeof args.excludeSongId === 'number' &&
      Number.isFinite(args.excludeSongId) &&
      args.excludeSongId > 0
        ? Math.trunc(args.excludeSongId)
        : null;
    const needsFullLyrics =
      String(args.lyrics ?? '').trim().length >= 40 ||
      String(args.firstLyrics ?? '').trim().length >= 10;

    const rows = await this.prisma.song.findMany({
      where: excludeSongId ? { id: { not: excludeSongId } } : undefined,
      select: {
        id: true,
        title: true,
        firstLyrics: true,
        lyrics: needsFullLyrics,
      },
      orderBy: [{ id: 'asc' }],
      take: 6000,
    });

    return {
      items: rankSongDuplicateCandidates(
        {
          title: args.title,
          firstLyrics: args.firstLyrics,
          lyrics: args.lyrics,
        },
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          firstLyrics: row.firstLyrics,
          lyrics: needsFullLyrics ? (row as any).lyrics : null,
        })),
        take,
      ),
    };
  }

  private computeSearchVersionMeta(versions: any[]) {
    const singerFrontNames: string[] = [];
    const singerBackNames: string[] = [];
    const years: number[] = [];
    const versionSingerPairs: any[] = [];

    for (const version of versions ?? []) {
      const year = typeof version?.year === 'number' ? version.year : null;
      if (year && Number.isFinite(year)) years.push(year);

      const frontArtists: any[] = [];
      const backArtists: any[] = [];

      for (const va of version?.artists ?? []) {
        const role = String(va?.role ?? '');
        const artist = va?.artist ?? null;
        if (!artist) continue;

        const name = buildArtistDisplayName(artist);
        if (role === VersionArtistRole.SINGER_FRONT) {
          frontArtists.push(artist);
          if (name) singerFrontNames.push(name);
        }
        if (role === VersionArtistRole.SINGER_BACK) {
          backArtists.push(artist);
          if (name) singerBackNames.push(name);
        }
      }

      for (const front of frontArtists) {
        for (const back of backArtists) {
          const frontId = Number(front?.id);
          const backId = Number(back?.id);
          if (!Number.isFinite(frontId) || !Number.isFinite(backId)) continue;
          versionSingerPairs.push({
            versionId: Number(version?.id) || null,
            year,
            frontId,
            backId,
            frontName: buildArtistDisplayName(front),
            backName: buildArtistDisplayName(back),
          });
        }
      }
    }

    const uniqueYears = Array.from(new Set(years)).sort((a, b) => a - b);
    const minYear = uniqueYears.length ? uniqueYears[0] : null;
    const maxYear = uniqueYears.length ? uniqueYears[uniqueYears.length - 1] : null;
    const yearText =
      uniqueYears.length === 0
        ? null
        : uniqueYears.length === 1
          ? String(uniqueYears[0])
          : `${uniqueYears[0]}-${uniqueYears[uniqueYears.length - 1]}`;

    return {
      singerFrontNames: Array.from(new Set(singerFrontNames)),
      singerBackNames: Array.from(new Set(singerBackNames)),
      years: uniqueYears,
      minYear,
      maxYear,
      yearText,
      versionSingerPairs,
    };
  }

  private buildOfflineSearchSong(song: any) {
    const credits = song?.credits ?? [];
    const composerArtists = credits
      .filter((c: any) => c.role === SongCreditRole.COMPOSER && c.artist)
      .map((c: any) => c.artist);
    const lyricistArtists = credits
      .filter((c: any) => c.role === SongCreditRole.LYRICIST && c.artist)
      .map((c: any) => c.artist);

    const composer = composerArtists[0] || null;
    const lyricist = lyricistArtists[0] || null;
    const tagRows = Array.isArray(song?.SongTag) ? song.SongTag : [];
    const tags = tagRows.map((st: any) => st?.Tag).filter(Boolean);
    const listIds = Array.from(
      new Set(
        (song?.listItems ?? [])
          .map((li: any) => Number(li?.listId))
          .filter((n: number) => Number.isFinite(n) && n > 0),
      ),
    );
    const versionMeta = this.computeSearchVersionMeta(song?.versions ?? []);
    const hasChords = !!String(song?.chords ?? '').trim();
    const isInstrumental = Boolean(song?.isInstrumental);
    const hasLyrics = !isInstrumental && !!String(song?.lyrics ?? '').trim();
    const hasScore =
      Boolean(song?.hasScore) || !!String(song?.scoreFile ?? '').trim();

    return {
      id: song.id,
      legacySongId: song.legacySongId ?? null,
      isInstrumental,
      title: song.title ?? '',
      firstLyrics: hasLyrics
        ? extractFirstLyricsFromLyrics(song.lyrics) ?? song.firstLyrics ?? null
        : null,
      lyrics: hasLyrics ? song.lyrics ?? null : null,
      characteristics: song.characteristics ?? null,
      originalKey: song.originalKey ?? null,
      categoryId: song.categoryId ?? null,
      categoryTitle: song.category?.title ?? null,
      rythmId: song.rythmId ?? null,
      rythmTitle: song.rythm?.title ?? null,
      createdById: song.createdByUserId ?? song.createdBy?.id ?? null,
      createdByName:
        song.createdBy?.displayName?.trim?.() ||
        song.createdBy?.username?.trim?.() ||
        null,
      composerId: composer?.id ?? null,
      composerName: composer ? buildArtistDisplayName(composer) : null,
      lyricistId: lyricist?.id ?? null,
      lyricistName: lyricist ? buildArtistDisplayName(lyricist) : null,
      singerFrontNames: versionMeta.singerFrontNames,
      singerBackNames: versionMeta.singerBackNames,
      tagIds: tags.map((t: any) => Number(t.id)).filter((n: number) => Number.isFinite(n) && n > 0),
      tagTitles: tags.map((t: any) => String(t.title ?? '').trim()).filter(Boolean),
      tagSlugs: tags.map((t: any) => String(t.slug ?? '').trim()).filter(Boolean),
      listIds,
      years: versionMeta.years,
      minYear: versionMeta.minYear,
      maxYear: versionMeta.maxYear,
      yearText: versionMeta.yearText,
      versionSingerPairs: versionMeta.versionSingerPairs,
      views: typeof song.views === 'number' ? song.views : 0,
      status: song.status ?? null,
      scoreFile: song.scoreFile ?? null,
      hasChords,
      hasLyrics,
      hasScore,
      chords: hasChords ? 1 : 0,
      partiture: hasScore ? 1 : 0,
      updatedAt:
        song.updatedAt instanceof Date
          ? song.updatedAt.toISOString()
          : song.updatedAt ?? null,
    };
  }

  private parseOfflineSongChangeCursor(
    raw?: string | null,
  ): { since: Date; id: number } | null {
    const text = String(raw || '').trim();
    if (!text) return null;

    const [dateText, idText] = text.split('|');
    const sinceMs = Date.parse(dateText);
    if (!Number.isFinite(sinceMs)) return null;

    const id = Math.trunc(Number(idText ?? 0));
    return {
      since: new Date(sinceMs),
      id: Number.isFinite(id) && id > 0 ? id : 0,
    };
  }

  private formatOfflineSongChangeCursor(date: Date, id = 0): string {
    const normalizedId = Math.max(0, Math.trunc(Number(id) || 0));
    return `${date.toISOString()}|${normalizedId}`;
  }

  async findOfflineChanges(
    sinceRaw?: string | null,
    takeRaw?: string | number | null,
  ): Promise<OfflineSongChangesDto> {
    const serverNow = new Date();
    const serverTime = serverNow.toISOString();
    const cursor = this.parseOfflineSongChangeCursor(sinceRaw);
    const takeNumber = Math.trunc(Number(takeRaw ?? 200));
    const take = Math.min(Math.max(Number.isFinite(takeNumber) ? takeNumber : 200, 1), 500);

    if (!cursor) {
      return {
        serverTime,
        items: [],
        removedIds: [],
        hasMore: false,
        nextSince: this.formatOfflineSongChangeCursor(serverNow),
      };
    }

    const where: Prisma.SongWhereInput =
      cursor.id > 0
        ? {
            OR: [
              { updatedAt: { gt: cursor.since } },
              { updatedAt: cursor.since, id: { gt: cursor.id } },
            ],
          }
        : { updatedAt: { gt: cursor.since } };

    const rows = await this.prisma.song.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      include: {
        category: true,
        rythm: true,
        credits: { include: { artist: true } },
        versions: { include: { artists: { include: { artist: true } } } },
        createdBy: { select: { id: true, displayName: true, username: true } },
        SongTag: {
          include: { Tag: { select: { id: true, title: true, slug: true } } },
          orderBy: [{ tagId: 'asc' }],
        },
        listItems: { select: { listId: true } },
      },
    });

    const page = rows.slice(0, take);
    const last = page[page.length - 1] as any;
    const lastUpdatedAt =
      last?.updatedAt instanceof Date
        ? last.updatedAt
        : last?.updatedAt
          ? new Date(last.updatedAt)
          : null;
    const nextSince =
      lastUpdatedAt && Number.isFinite(lastUpdatedAt.getTime())
        ? this.formatOfflineSongChangeCursor(lastUpdatedAt, last.id)
        : this.formatOfflineSongChangeCursor(serverNow);

    return {
      serverTime,
      items: page.map((song) => this.buildOfflineSearchSong(song)),
      removedIds: [],
      hasMore: rows.length > take,
      nextSince,
    };
  }

  async recommendForUser(userId: number, takeRaw?: string): Promise<SongRecommendationsResponse> {
    const take = Math.min(Math.max(Number(takeRaw) || 8, 1), 12);
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);

    const [sourceItems, historyEvents] = await Promise.all([
      this.prisma.listItem.findMany({
        where: {
          songId: { not: null },
          list: {
            members: { some: { userId } },
          },
        },
        orderBy: [
          { list: { updatedAt: 'desc' } },
          { sortId: 'asc' },
          { id: 'desc' },
        ],
        take: 120,
        include: {
          song: {
            include: {
              category: true,
              rythm: true,
              SongTag: { include: { Tag: true } },
            },
          },
        },
      }),
      (this.prisma as any).userHistoryEvent.findMany({
        where: { userId, occurredAt: { gte: since } },
        orderBy: { occurredAt: 'desc' },
        take: 180,
        include: {
          song: {
            include: {
              category: true,
              rythm: true,
              SongTag: { include: { Tag: true } },
            },
          },
        },
      }),
    ]);

    const listSongs = sourceItems.map((item) => item.song).filter(Boolean);
    const recentSongRows = historyEvents.filter((event: any) => event.type === 'SONG_VIEW' && event.song);
    const searchRows = historyEvents.filter((event: any) => event.type === 'SONG_SEARCH' && event.searchTerm);

    const normalizeText = (value: unknown) =>
      String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('el-GR')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const searchTermScores = new Map<string, { label: string; score: number }>();
    for (const [index, row] of searchRows.entries()) {
      const label = String(row.searchTerm || '').trim().slice(0, 80);
      const term = normalizeText(label);
      if (term.length < 3) continue;
      const recency = index < 12 ? 4 : index < 40 ? 2 : 1;
      const prev = searchTermScores.get(term);
      searchTermScores.set(term, { label: prev?.label || label, score: (prev?.score || 0) + recency });
    }

    const searchTerms = Array.from(searchTermScores.entries())
      .sort((a, b) => b[1].score - a[1].score || a[1].label.localeCompare(b[1].label, 'el-GR'))
      .slice(0, 5)
      .map(([, data]) => data.label);

    const sourceSongWeights = new Map<number, { song: any; weight: number; fromList: boolean; fromHistory: boolean }>();
    const addSourceSong = (song: any, weight: number, source: 'list' | 'history') => {
      if (!song?.id) return;
      const prev = sourceSongWeights.get(song.id);
      sourceSongWeights.set(song.id, {
        song: prev?.song || song,
        weight: (prev?.weight || 0) + weight,
        fromList: Boolean(prev?.fromList || source === 'list'),
        fromHistory: Boolean(prev?.fromHistory || source === 'history'),
      });
    };

    listSongs.forEach((song, index) => addSourceSong(song, index < 20 ? 2 : index < 60 ? 1.3 : 0.8, 'list'));
    recentSongRows.forEach((row: any, index: number) => addSourceSong(row.song, index < 12 ? 4 : index < 45 ? 2.5 : 1.2, 'history'));

    const sourceSongs = Array.from(sourceSongWeights.values()).map((entry) => entry.song);

    if (!sourceSongs.length) {
      const popular = await this.prisma.song.findMany({
        where: { status: SongStatus.PUBLISHED },
        orderBy: [
          { views: 'desc' },
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
        take,
        include: {
          category: true,
          rythm: true,
          SongTag: { include: { Tag: true } },
        },
      });

      return {
        items: popular.map((song) => this.recommendationSongToDto(song, ['Δημοφιλές τραγούδι'])),
        profile: {
          sourceSongCount: 0,
          recentSongCount: 0,
          listSongCount: 0,
          searchTerms,
          categoryTitles: [],
          rythmTitles: [],
          tagTitles: [],
        },
        suggestions: searchTerms.slice(0, 3).map((term) => ({
          label: `Συνέχισε: ${term}`,
          description: 'Πρόσφατη αναζήτηση',
          filters: { search_term: term },
        })),
      };
    }

    const sourceSongIds = new Set<number>();
    const categoryScores = new Map<number, { title: string; score: number }>();
    const rythmScores = new Map<number, { title: string; score: number }>();
    const tagScores = new Map<number, { title: string; score: number }>();

    const bump = (
      map: Map<number, { title: string; score: number }>,
      id: number | null | undefined,
      title: string | null | undefined,
      amount: number,
    ) => {
      if (!id || !title) return;
      const prev = map.get(id);
      map.set(id, { title, score: (prev?.score || 0) + amount });
    };

    sourceSongs.forEach((song, index) => {
      if (!song?.id) return;
      sourceSongIds.add(song.id);
      const sourceWeight = sourceSongWeights.get(song.id)?.weight || (index < 20 ? 3 : index < 60 ? 2 : 1);
      bump(categoryScores, song.categoryId, song.category?.title, sourceWeight);
      bump(rythmScores, song.rythmId, song.rythm?.title, sourceWeight);
      for (const st of song.SongTag || []) {
        bump(tagScores, st.tagId, st.Tag?.title, sourceWeight);
      }
    });

    const topIds = (
      map: Map<number, { title: string; score: number }>,
      limit: number,
    ) =>
      Array.from(map.entries())
        .sort((a, b) => b[1].score - a[1].score || a[1].title.localeCompare(b[1].title))
        .slice(0, limit)
        .map(([id]) => id);

    const categoryIds = topIds(categoryScores, 4);
    const rythmIds = topIds(rythmScores, 4);
    const tagIds = topIds(tagScores, 6);
    const candidateSearchTerms = searchTerms
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
      .slice(0, 4);

    const where: Prisma.SongWhereInput = {
      status: SongStatus.PUBLISHED,
      id: { notIn: Array.from(sourceSongIds) },
      OR: [
        ...(categoryIds.length ? [{ categoryId: { in: categoryIds } }] : []),
        ...(rythmIds.length ? [{ rythmId: { in: rythmIds } }] : []),
        ...(tagIds.length ? [{ SongTag: { some: { tagId: { in: tagIds } } } }] : []),
        ...candidateSearchTerms.flatMap((term) => [
          { title: { contains: term, mode: 'insensitive' as const } },
          { firstLyrics: { contains: term, mode: 'insensitive' as const } },
        ]),
      ],
    };

    if (!where.OR?.length) {
      delete where.OR;
    }

    const recommendations = await this.prisma.song.findMany({
      where,
      orderBy: [
        { views: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      take: take * 5,
      include: {
        category: true,
        rythm: true,
        SongTag: { include: { Tag: true } },
      },
    });

    const ranked = recommendations
      .map((song) => {
        const reasons: string[] = [];
        const categoryScore = song.categoryId ? categoryScores.get(song.categoryId)?.score || 0 : 0;
        const rythmScore = song.rythmId ? rythmScores.get(song.rythmId)?.score || 0 : 0;
        if (categoryScore) reasons.push(`Σου ταιριάζει στην κατηγορία: ${song.category?.title || ''}`.trim());
        if (rythmScore) reasons.push(`Σου ταιριάζει στον ρυθμό: ${song.rythm?.title || ''}`.trim());
        const matchingTags = (song.SongTag || [])
          .filter((st) => tagScores.has(st.tagId))
          .map((st) => st.Tag?.title)
          .filter(Boolean)
          .slice(0, 2);
        if (matchingTags.length) reasons.push(`Κοινά χαρακτηριστικά: ${matchingTags.join(', ')}`);
        const normalizedTitle = normalizeText(song.title);
        const normalizedFirstLyrics = normalizeText(song.firstLyrics);
        const normalizedTags = normalizeText((song.SongTag || []).map((st) => st.Tag?.title).filter(Boolean).join(' '));
        const matchingSearchTerms = candidateSearchTerms.filter((term) => {
          const normalizedTerm = normalizeText(term);
          return (
            normalizedTerm.length >= 3 &&
            (normalizedTitle.includes(normalizedTerm) ||
              normalizedFirstLyrics.includes(normalizedTerm) ||
              normalizedTags.includes(normalizedTerm))
          );
        });
        if (matchingSearchTerms.length) reasons.push(`Σχετικό με αναζήτηση: ${matchingSearchTerms.slice(0, 2).join(', ')}`);
        if (!reasons.length) reasons.push('Συγγενικό με τις πρόσφατες επιλογές σου');
        const score =
          categoryScore * 1.3 +
          rythmScore * 1.2 +
          (song.SongTag || []).reduce((sum, st) => sum + (tagScores.get(st.tagId)?.score || 0), 0) +
          matchingSearchTerms.reduce((sum, term) => sum + (searchTermScores.get(normalizeText(term))?.score || 1) * 2.2, 0) +
          Math.log10((song.views || 0) + 1);
        return { song, reasons, score };
      })
      .sort((a, b) => b.score - a.score || (b.song.views || 0) - (a.song.views || 0))
      .slice(0, take);

    const topTitles = (
      map: Map<number, { title: string; score: number }>,
      limit: number,
    ) =>
      Array.from(map.values())
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, limit)
        .map((x) => x.title);

    const profileCategoryTitles = topTitles(categoryScores, 4);
    const profileRythmTitles = topTitles(rythmScores, 4);
    const profileTagTitles = topTitles(tagScores, 6);
    const suggestions = [
      ...Array.from(categoryScores.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 2)
        .map(([id, data]) => ({
          label: data.title,
          description: 'Κατηγορία που εμφανίζεται συχνά στις επιλογές σου',
          filters: { category_id: String(id) },
        })),
      ...Array.from(rythmScores.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 2)
        .map(([id, data]) => ({
          label: data.title,
          description: 'Ρυθμός που εμφανίζεται συχνά στις επιλογές σου',
          filters: { rythm_id: String(id) },
        })),
      ...searchTerms.slice(0, 2).map((term) => ({
        label: term,
        description: 'Πρόσφατη αναζήτηση',
        filters: { search_term: term },
      })),
    ].slice(0, 5);

    return {
      items: ranked.map(({ song, reasons }) => this.recommendationSongToDto(song, reasons)),
      profile: {
        sourceSongCount: sourceSongIds.size,
        recentSongCount: recentSongRows.length,
        listSongCount: listSongs.length,
        searchTerms,
        categoryTitles: profileCategoryTitles,
        rythmTitles: profileRythmTitles,
        tagTitles: profileTagTitles,
      },
      suggestions,
    };
  }

  private recommendationSongToDto(song: any, reasons: string[]): RecommendedSongDto {
    return {
      id: Number(song.id),
      title: song.title ?? '',
      firstLyrics: song.firstLyrics ?? null,
      categoryId: song.categoryId ?? null,
      categoryTitle: song.category?.title ?? null,
      rythmId: song.rythmId ?? null,
      rythmTitle: song.rythm?.title ?? null,
      originalKey: song.originalKey ?? null,
      originalKeySign: song.originalKeySign === '+' || song.originalKeySign === '-' ? song.originalKeySign : null,
      views: typeof song.views === 'number' ? song.views : null,
      hasChords: typeof song.chords === 'string' && song.chords.trim().length > 0,
      hasScore: Boolean(song.hasScore || song.scoreFile),
      isInstrumental: Boolean(song.isInstrumental),
      tags: Array.isArray(song.SongTag)
        ? song.SongTag.map((st: any) => st.Tag?.title).filter(Boolean).slice(0, 6)
        : [],
      reasons: reasons.filter(Boolean).slice(0, 3),
    };
  }

  /**
   * Επιστρέφει 1 τραγούδι σε DTO συμβατό με το SongDetail του Next.
   * Αν noIncrement=true δεν αυξάνει τα views.
   */
  async findOne(id: number, noIncrement = false): Promise<SongDetailDto> {
    if (!noIncrement) {
      const updated = await this.prisma.song.updateMany({
        where: { id },
        data: { views: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new NotFoundException(`Song with id=${id} not found`);
      }

      try {
        await this.esSync?.upsertSong(id);
      } catch (e) {
        console.error('[SongsService] ES upsert after view increment failed', e);
      }
    }

    const song = await this.prisma.song.findUnique({
      where: { id },
      include: {
        category: true,
        rythm: true,
        basedOnSong: { select: { id: true, title: true } },
        credits: { include: { artist: true } },
        versions: { include: { artists: { include: { artist: true } } } },

        createdBy: { select: { id: true, displayName: true, username: true } },

        SongTag: {
          include: { Tag: { select: { id: true, title: true, slug: true } } },
          orderBy: [{ tagId: 'asc' }],
        },

        SongAsset: {
          include: { Asset: true },
          orderBy: [{ sort: 'asc' }, { assetId: 'asc' }],
        },
      },
    });

    if (!song) throw new NotFoundException(`Song with id=${id} not found`);

    console.log('[SongsService.findOne] RETURNING', {
      id: song.id,
      views: song.views,
      noIncrement,
    });

    const categoryTitle = song.category?.title ?? null;
    const rythmTitle = song.rythm?.title ?? null;

    const composerArtists = (song.credits ?? [])
      .filter((c) => c.role === SongCreditRole.COMPOSER && c.artist)
      .map((c) => c.artist);

    const lyricistArtists = (song.credits ?? [])
      .filter((c) => c.role === SongCreditRole.LYRICIST && c.artist)
      .map((c) => c.artist);

    const composerName =
      composerArtists.length > 0
        ? composerArtists.map((a) => buildArtistDisplayName(a)).join(', ')
        : null;

    const lyricistName =
      lyricistArtists.length > 0
        ? lyricistArtists.map((a) => buildArtistDisplayName(a)).join(', ')
        : null;

    const creditsDto = {
      composers: (song.credits ?? [])
        .filter((c) => c.role === SongCreditRole.COMPOSER && c.artist)
        .map((c) => ({
          creditId: c.id,
          artistId: c.artistId,
          title: c.artist.title,
          firstName: c.artist.firstName ?? null,
          lastName: c.artist.lastName ?? null,
        })),
      lyricists: (song.credits ?? [])
        .filter((c) => c.role === SongCreditRole.LYRICIST && c.artist)
        .map((c) => ({
          creditId: c.id,
          artistId: c.artistId,
          title: c.artist.title,
          firstName: c.artist.firstName ?? null,
          lastName: c.artist.lastName ?? null,
        })),
    };

    const basedOnSongId = song.basedOnSong?.id ?? null;
    const basedOnSongTitle = song.basedOnSong?.title ?? null;

    const versions: SongVersionDto[] =
      song.versions?.map((v) => {
        const frontArray = (v.artists ?? []).filter(
          (x) => x.role === VersionArtistRole.SINGER_FRONT,
        );
        const backArray = (v.artists ?? []).filter(
          (x) => x.role === VersionArtistRole.SINGER_BACK,
        );
        const soloArray = (v.artists ?? []).filter(
          (x) => x.role === VersionArtistRole.SOLOIST,
        );

        const singerFront =
          frontArray.length > 0
            ? frontArray
                .map((x) => x.artist)
                .filter((a): a is NonNullable<typeof a> => !!a)
                .map((a) => buildArtistDisplayName(a))
                .join(', ')
            : null;

        const singerBack =
          backArray.length > 0
            ? backArray
                .map((x) => x.artist)
                .filter((a): a is NonNullable<typeof a> => !!a)
                .map((a) => buildArtistDisplayName(a))
                .join(', ')
            : null;

        const solist =
          soloArray.length > 0
            ? soloArray
                .map((x) => x.artist)
                .filter((a): a is NonNullable<typeof a> => !!a)
                .map((a) => buildArtistDisplayName(a))
                .join(', ')
            : null;

        const singerFrontIds = frontArray
          .map((x) => x.artistId)
          .filter((x): x is number => typeof x === 'number');

        const singerBackIds = backArray
          .map((x) => x.artistId)
          .filter((x): x is number => typeof x === 'number');

        const solistIds = soloArray
          .map((x) => x.artistId)
          .filter((x): x is number => typeof x === 'number');

        return {
          id: v.id,
          year: v.year ?? null,
          singerFront,
          singerBack,
          solist,
          youtubeSearch: v.youtubeSearch ?? null,
          singerFrontIds,
          singerBackIds,
          solistIds,
        };
      }) ?? [];

    const assets: SongAssetDto[] = (song.SongAsset ?? []).map((sa) => ({
      id: sa.Asset.id,
      kind: sa.Asset.kind,
      type: sa.Asset.type,
      title: sa.Asset.title ?? null,
      url: sa.Asset.url ?? null,
      filePath: sa.Asset.filePath ?? null,
      mimeType: sa.Asset.mimeType ?? null,
      sizeBytes: toNullableBigIntString(sa.Asset.sizeBytes),
      label: sa.label ?? null,
      sort: sa.sort ?? 0,
      isPrimary: sa.isPrimary ?? false,
    }));

    const hasScore = assets.some((a) =>
      isScoreAssetLike({
        title: a.title,
        url: a.url,
        filePath: a.filePath,
        mimeType: a.mimeType,
      }),
    );

    const tags: TagDto[] = (song.SongTag ?? [])
      .map((st) => st.Tag)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, title: t.title, slug: t.slug }));

    const createdByUserId = song.createdByUserId ?? song.createdBy?.id ?? null;
    const createdByDisplayName =
      song.createdBy?.displayName?.trim() ||
      song.createdBy?.username?.trim() ||
      null;

    return {
      id: song.id,
      legacySongId: song.legacySongId,
      hasScore,
      isInstrumental: Boolean((song as any).isInstrumental),

      title: song.title,
      firstLyrics: (song as any).isInstrumental ? null : song.firstLyrics ?? null,
      lyrics: (song as any).isInstrumental ? null : song.lyrics ?? null,

      characteristics: song.characteristics ?? null,

      tags,
      assets,

      originalKey: song.originalKey ?? null,
      originalKeySign:
        song.originalKeySign === '-'
          ? '-'
          : song.originalKeySign === '+'
            ? '+'
            : null,

      chords: song.chords ?? null,
      status: song.status ?? null,

      categoryId: song.categoryId ?? null,
      rythmId: song.rythmId ?? null,
      makamId: null,

      categoryTitle,
      composerName,
      lyricistName,
      credits: creditsDto,
      rythmTitle,

      basedOnSongId,
      basedOnSongTitle,

      views: song.views ?? 0,

      createdByUserId,
      createdByDisplayName,

      versions,
    };
  }

  private validateAssetInput(input: {
    kind: AssetKind;
    url?: string | null;
    filePath?: string | null;
  }) {
    if (input.kind === AssetKind.LINK) {
      const url = (input.url ?? '').trim();
      if (!url) throw new BadRequestException('Asset LINK requires url');
    }
    if (input.kind === AssetKind.FILE) {
      const fp = (input.filePath ?? '').trim();
      if (!fp) throw new BadRequestException('Asset FILE requires filePath');
    }
  }

  private async upsertArtistsByTitlesTx(
    tx: any,
    titles: string[],
  ): Promise<number[]> {
    const ids: number[] = [];
    for (const title of titles) {
      const t = title.trim();
      if (!t) continue;

      const existing = await tx.artist.findFirst({
        where: { title: t },
        select: { id: true },
      });

      if (existing?.id) {
        ids.push(existing.id);
        continue;
      }

      const created = await tx.artist.create({
        data: { title: t },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  }

  private normalizeYear(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      const n = Math.trunc(v);
      return n > 0 ? n : null;
    }
    const s = String(v).trim();
    if (!s) return null;
    const n = Math.trunc(Number(s));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  private async assertArtistsExistTx(tx: any, ids: number[], context: string) {
    if (ids.length === 0) return;

    const uniq = Array.from(new Set(ids));
    const existing = await tx.artist.findMany({
      where: { id: { in: uniq } },
      select: { id: true },
    });
    const ok = new Set(existing.map((x) => x.id));
    const missing = uniq.filter((x) => !ok.has(x));
    if (missing.length) {
      throw new BadRequestException(
        `${context}: missing Artist.id(s) = ${missing.join(',')}`,
      );
    }
  }

  private async removeInstrumentalTagIdsTx(
    tx: any,
    tagIds: number[],
  ): Promise<number[]> {
    const ids = tagIds
      .map((x) => Math.trunc(Number(x)))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (!ids.length) return [];

    const instrumentalTags = await tx.tag.findMany({
      where: {
        id: { in: ids },
        OR: [
          { title: 'Οργανικό' },
          { title: { equals: 'οργανικό', mode: 'insensitive' } },
          { slug: { equals: 'οργανικό', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    const blocked = new Set(
      instrumentalTags.map((tag: any) => Math.trunc(Number(tag.id))),
    );
    return ids.filter((id) => !blocked.has(id));
  }

  async updateSong(id: number, body: UpdateSongBody) {
    const existing = await this.prisma.song.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Song with id=${id} not found`);
    }

    const data: any = {};
    const hasIsInstrumental = Object.prototype.hasOwnProperty.call(
      body,
      'isInstrumental',
    );
    const isInstrumental = hasIsInstrumental
      ? normalizeBooleanInput(body.isInstrumental) === true
      : null;

    // --- core fields ---
    if (typeof body.title === 'string') data.title = body.title;

    if (hasIsInstrumental) {
      data.isInstrumental = isInstrumental === true;
    }

    // ✅ lyrics -> firstLyrics (only if lyrics is provided)
    if (isInstrumental === true) {
      data.lyrics = null;
      data.firstLyrics = null;
    } else if (Object.prototype.hasOwnProperty.call(body, 'lyrics')) {
      data.lyrics = body.lyrics;
      data.firstLyrics = extractFirstLyricsFromLyrics(body.lyrics);
    } else if (Object.prototype.hasOwnProperty.call(body, 'firstLyrics')) {
      data.firstLyrics = body.firstLyrics;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'characteristics')) {
      data.characteristics = body.characteristics;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'originalKey')) {
      data.originalKey = body.originalKey;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'highestVocalNote')) {
      data.highestVocalNote = body.highestVocalNote;
    }

    if (body.status && Object.values(SongStatus).includes(body.status)) {
      data.status = body.status;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
      data.categoryId = body.categoryId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'rythmId')) {
      data.rythmId = body.rythmId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'basedOnSongId')) {
      data.basedOnSongId = body.basedOnSongId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'createdByUserId')) {
      data.createdByUserId = body.createdByUserId;
    }

    // --- originalKeySign + chords (canonical, safe) ---
    const hasOriginalKeySign = Object.prototype.hasOwnProperty.call(
      body,
      'originalKeySign',
    );
    const hasChords = Object.prototype.hasOwnProperty.call(body, 'chords');

    // 1) Αν στάλθηκε ρητά sign, αυτό κερδίζει πάντα
    if (hasOriginalKeySign) {
      data.originalKeySign =
        body.originalKeySign === '-'
          ? '-'
          : body.originalKeySign === '+'
            ? '+'
            : null;
    } else if (typeof body.chords === 'string') {
      data.originalKeySign = inferOriginalKeySignFromChords(body.chords);
    }

    // 2) Αν στάλθηκαν chords, τα σώζουμε.
    //    Και ΜΟΝΟ αν ΔΕΝ στάλθηκε sign, κάνουμε infer από αυτά τα chords
    if (hasChords) {
      data.chords = body.chords ?? null;

      if (!hasOriginalKeySign) {
        data.originalKeySign = inferOriginalKeySignFromChords(body.chords);
      }
    }

    const hasTagIds = Object.prototype.hasOwnProperty.call(body, 'tagIds');
    const hasAssets = Object.prototype.hasOwnProperty.call(body, 'assets');
    const hasVersions = Object.prototype.hasOwnProperty.call(body, 'versions');

    if (
      Object.keys(data).length === 0 &&
      !hasTagIds &&
      !hasAssets &&
      !hasVersions
    ) {
      return this.findOne(id, true);
    }

    await this.prisma.$transaction(async (tx) => {
      // 1) Song core fields
      if (Object.keys(data).length > 0) {
        await tx.song.update({
          where: { id },
          data,
        });
      }

      // 2) Tags replace-all
      if (hasTagIds) {
        const ids = Array.isArray(body.tagIds)
          ? body.tagIds.filter(
              (x) => typeof x === 'number' && Number.isFinite(x),
            )
          : [];
        const cleanIds = await this.removeInstrumentalTagIdsTx(tx, ids);

        await tx.songTag.deleteMany({ where: { songId: id } });

        if (cleanIds.length > 0) {
          await tx.songTag.createMany({
            data: cleanIds.map((tagId) => ({ songId: id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      // 3) Assets replace-all
      if (hasAssets) {
        const assets = Array.isArray(body.assets) ? body.assets : [];

        await tx.songAsset.deleteMany({ where: { songId: id } });

        for (let i = 0; i < assets.length; i++) {
          const a = assets[i];

          const kind = a.kind;
          const type = a.type ?? AssetType.GENERIC;

          this.validateAssetInput({
            kind,
            url: a.url ?? null,
            filePath: a.filePath ?? null,
          });

          const sort =
            typeof a.sort === 'number' && Number.isFinite(a.sort)
              ? a.sort
              : i * 10;

          const isPrimary = a.isPrimary === true;

          let assetId: number;

          if (typeof a.id === 'number' && Number.isFinite(a.id)) {
            const updated = await tx.asset.update({
              where: { id: a.id },
              data: {
                kind,
                type,
                title: Object.prototype.hasOwnProperty.call(a, 'title')
                  ? (a.title ?? null)
                  : undefined,
                url: kind === AssetKind.LINK ? (a.url ?? null) : null,
                filePath: kind === AssetKind.FILE ? (a.filePath ?? null) : null,
                mimeType: Object.prototype.hasOwnProperty.call(a, 'mimeType')
                  ? (a.mimeType ?? null)
                  : undefined,
                sizeBytes: Object.prototype.hasOwnProperty.call(a, 'sizeBytes')
                  ? toNullableBigInt(a.sizeBytes ?? null)
                  : undefined,
              },
              select: { id: true },
            });
            assetId = updated.id;
          } else {
            const created = await tx.asset.create({
              data: {
                kind,
                type,
                title: a.title ?? null,
                url: kind === AssetKind.LINK ? (a.url ?? null) : null,
                filePath: kind === AssetKind.FILE ? (a.filePath ?? null) : null,
                mimeType: a.mimeType ?? null,
                sizeBytes: toNullableBigInt(a.sizeBytes ?? null),
              },
              select: { id: true },
            });
            assetId = created.id;
          }

          await tx.songAsset.create({
            data: {
              songId: id,
              assetId,
              label: a.label ?? null,
              sort,
              isPrimary,
            },
          });
        }
      }

      // 4) Versions replace-all (με upsert)
      if (hasVersions) {
        const incoming = Array.isArray(body.versions) ? body.versions : [];

        const norm = incoming
          .map((v) => {
            const vid =
              typeof v?.id === 'number' && Number.isFinite(v.id)
                ? Math.trunc(v.id)
                : null;

            const year = this.normalizeYear(v?.year);

            const youtubeSearch = Object.prototype.hasOwnProperty.call(
              v ?? {},
              'youtubeSearch',
            )
              ? (v?.youtubeSearch ?? null)
              : null;

            const singerFrontNames = parseCsvNames(v?.singerFrontNames ?? '');
            const singerBackNames = parseCsvNames(v?.singerBackNames ?? '');
            const solistNames = parseCsvNames(v?.solistNames ?? '');

            const singerFrontIds = normalizeArtistIds(v?.singerFrontIds);
            const singerBackIds = normalizeArtistIds(v?.singerBackIds);
            const solistIds = normalizeArtistIds(v?.solistIds);

            const hasAny =
              year !== null ||
              (typeof youtubeSearch === 'string' &&
                youtubeSearch.trim() !== '') ||
              singerFrontIds.length > 0 ||
              singerBackIds.length > 0 ||
              solistIds.length > 0 ||
              singerFrontNames.length > 0 ||
              singerBackNames.length > 0 ||
              solistNames.length > 0 ||
              vid !== null;

            if (!hasAny) return null;

            return {
              id: vid,
              year,
              youtubeSearch:
                typeof youtubeSearch === 'string' && youtubeSearch.trim() !== ''
                  ? youtubeSearch
                  : null,
              singerFrontNames,
              singerBackNames,
              solistNames,
              singerFrontIds,
              singerBackIds,
              solistIds,
            };
          })
          .filter((x): x is NonNullable<typeof x> => !!x);

        const existingVersions = await tx.songVersion.findMany({
          where: { songId: id },
          select: { id: true },
          orderBy: [{ id: 'asc' }],
        });

        const existingIds = new Set(existingVersions.map((x) => x.id));
        const keepIds: number[] = [];

        for (const v of norm) {
          let versionId: number;

          if (v.id != null && existingIds.has(v.id)) {
            const updated = await tx.songVersion.update({
              where: { id: v.id },
              data: { year: v.year, youtubeSearch: v.youtubeSearch },
              select: { id: true },
            });
            versionId = updated.id;
          } else {
            const created = await tx.songVersion.create({
              data: {
                songId: id,
                year: v.year,
                youtubeSearch: v.youtubeSearch,
              },
              select: { id: true },
            });
            versionId = created.id;
          }

          keepIds.push(versionId);

          await tx.songVersionArtist.deleteMany({ where: { versionId } });

          const finalSingerFrontIds =
            v.singerFrontIds.length > 0
              ? v.singerFrontIds
              : await this.upsertArtistsByTitlesTx(tx, v.singerFrontNames);

          const finalSingerBackIds =
            v.singerBackIds.length > 0
              ? v.singerBackIds
              : await this.upsertArtistsByTitlesTx(tx, v.singerBackNames);

          const finalSolistIds =
            v.solistIds.length > 0
              ? v.solistIds
              : await this.upsertArtistsByTitlesTx(tx, v.solistNames);

          await this.assertArtistsExistTx(
            tx,
            [...finalSingerFrontIds, ...finalSingerBackIds, ...finalSolistIds],
            `versionsJson(versionId=${versionId})`,
          );

          const rows: Array<{
            versionId: number;
            artistId: number;
            role: VersionArtistRole;
          }> = [];

          for (const artistId of finalSingerFrontIds) {
            rows.push({
              versionId,
              artistId,
              role: VersionArtistRole.SINGER_FRONT,
            });
          }
          for (const artistId of finalSingerBackIds) {
            rows.push({
              versionId,
              artistId,
              role: VersionArtistRole.SINGER_BACK,
            });
          }
          for (const artistId of finalSolistIds) {
            rows.push({ versionId, artistId, role: VersionArtistRole.SOLOIST });
          }

          if (rows.length) {
            await tx.songVersionArtist.createMany({
              data: rows,
              skipDuplicates: true,
            });
          }
        }

        const keepSet = new Set(keepIds);
        const toDelete = existingVersions
          .map((x) => x.id)
          .filter((vid) => !keepSet.has(vid));

        if (toDelete.length) {
          await tx.songVersionArtist.deleteMany({
            where: { versionId: { in: toDelete } },
          });
          await tx.songVersion.deleteMany({ where: { id: { in: toDelete } } });
        }
      }
    });

    // ✅ ES sync best-effort
    try {
      await this.esSync?.upsertSong(id);
    } catch (e) {
      console.error('[SongsService] ES upsert failed', e);
    }

    return this.findOne(id, true);
  }

  /**
   * ✅ Διαγραφή τραγουδιού
   */
  async deleteSong(id: number) {
    const existing = await this.prisma.song.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!existing) throw new NotFoundException(`Song with id=${id} not found`);

    try {
      const deleted = await this.prisma.$transaction(async (tx) => {
        // (A) ListItem.songId είναι optional -> αποσύνδεση
        await tx.listItem.updateMany({
          where: { songId: id },
          data: { songId: null },
        });

        // (B) Versions: πρώτα artists, μετά versions
        const versions = await tx.songVersion.findMany({
          where: { songId: id },
          select: { id: true },
        });
        const versionIds = versions.map((v) => v.id);

        if (versionIds.length > 0) {
          await tx.songVersionArtist.deleteMany({
            where: { versionId: { in: versionIds } },
          });

          await tx.songVersion.deleteMany({
            where: { id: { in: versionIds } },
          });
        }

        // (C) Credits
        await tx.songCredit.deleteMany({ where: { songId: id } });

        // (D) Song-Asset joins μόνο, όχι delete των Asset rows εδώ
        await tx.songAsset.deleteMany({ where: { songId: id } });

        // (E) Tags
        await tx.songTag.deleteMany({ where: { songId: id } });

        // (F) Τελική διαγραφή Song
        return tx.song.delete({
          where: { id },
          select: { id: true, title: true },
        });
      });

      // ✅ ES sync (best-effort)
      try {
        await (this.esSync as any)?.deleteSong?.(id);
      } catch (e) {
        console.error('[SongsService] ES delete failed', e);
      }

      return deleted;
    } catch (err: any) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Δεν μπορεί να διαγραφεί το τραγούδι επειδή υπάρχουν συσχετισμένα δεδομένα που το αναφέρουν (FK constraint).',
        );
      }

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(`Song with id=${id} not found`);
      }

      throw err;
    }
  }

  /**
   * Δημιουργεί νέο τραγούδι.
   */
  async createSong(body: UpdateSongBody) {
    const data: any = {};
    const isInstrumental =
      normalizeBooleanInput((body as any).isInstrumental) === true;

    if (typeof body.title === 'string' && body.title.trim() !== '') {
      data.title = body.title.trim();
    } else {
      throw new BadRequestException('title is required for new song');
    }

    data.isInstrumental = isInstrumental;

    if (isInstrumental) {
      data.lyrics = null;
      data.firstLyrics = null;
    } else if (Object.prototype.hasOwnProperty.call(body, 'lyrics')) {
      data.lyrics = body.lyrics ?? null;
      data.firstLyrics = extractFirstLyricsFromLyrics(body.lyrics);
    } else if (Object.prototype.hasOwnProperty.call(body, 'firstLyrics')) {
      data.firstLyrics = body.firstLyrics;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'characteristics')) {
      data.characteristics = body.characteristics;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'originalKey')) {
      data.originalKey = body.originalKey;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'highestVocalNote')) {
      data.highestVocalNote = body.highestVocalNote;
    }

    if (body.status && Object.values(SongStatus).includes(body.status)) {
      data.status = body.status;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
      data.categoryId = body.categoryId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'rythmId')) {
      data.rythmId = body.rythmId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'basedOnSongId')) {
      data.basedOnSongId = body.basedOnSongId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'createdByUserId')) {
      data.createdByUserId = body.createdByUserId;
    }

    // --- originalKeySign + chords (canonical, safe) ---
    const hasOriginalKeySign = Object.prototype.hasOwnProperty.call(
      body,
      'originalKeySign',
    );
    const hasChords = Object.prototype.hasOwnProperty.call(body, 'chords');

    if (hasOriginalKeySign) {
      data.originalKeySign =
        body.originalKeySign === '-'
          ? '-'
          : body.originalKeySign === '+'
            ? '+'
            : null;
    } else if (typeof body.chords === 'string') {
      data.originalKeySign = inferOriginalKeySignFromChords(body.chords);
    }

    if (hasChords) {
      data.chords = body.chords ?? null;

      if (!hasOriginalKeySign) {
        data.originalKeySign = inferOriginalKeySignFromChords(body.chords);
      }
    }

    const hasTagIds = Object.prototype.hasOwnProperty.call(body, 'tagIds');
    const hasAssets = Object.prototype.hasOwnProperty.call(body, 'assets');
    const hasVersions = Object.prototype.hasOwnProperty.call(body, 'versions');

    const songId = await this.prisma.$transaction(async (tx) => {
      const baseSlug = slugifySongTitle(data.title);
      const slug = await ensureUniqueSongSlugTx(tx, baseSlug);

      const createdSong = await tx.song.create({
        data: { ...data, slug },
        select: { id: true },
      });

      const songId = createdSong.id;

      // Tags
      if (hasTagIds) {
        const ids = Array.isArray(body.tagIds)
          ? body.tagIds.filter(
              (x) => typeof x === 'number' && Number.isFinite(x),
            )
          : [];
        const cleanIds = await this.removeInstrumentalTagIdsTx(tx, ids);

        if (cleanIds.length > 0) {
          await tx.songTag.createMany({
            data: cleanIds.map((tagId) => ({ songId, tagId })),
            skipDuplicates: true,
          });
        }
      }

      // Assets
      if (hasAssets) {
        const assets = Array.isArray(body.assets) ? body.assets : [];

        for (let i = 0; i < assets.length; i++) {
          const a = assets[i];

          const kind = a.kind;
          const type = a.type ?? AssetType.GENERIC;

          this.validateAssetInput({
            kind,
            url: a.url ?? null,
            filePath: a.filePath ?? null,
          });

          const sort =
            typeof a.sort === 'number' && Number.isFinite(a.sort)
              ? a.sort
              : i * 10;

          const isPrimary = a.isPrimary === true;

          let assetId: number;

          if (typeof a.id === 'number' && Number.isFinite(a.id)) {
            const updated = await tx.asset.update({
              where: { id: a.id },
              data: {
                kind,
                type,
                title: Object.prototype.hasOwnProperty.call(a, 'title')
                  ? (a.title ?? null)
                  : undefined,
                url: kind === AssetKind.LINK ? (a.url ?? null) : null,
                filePath: kind === AssetKind.FILE ? (a.filePath ?? null) : null,
                mimeType: Object.prototype.hasOwnProperty.call(a, 'mimeType')
                  ? (a.mimeType ?? null)
                  : undefined,
                sizeBytes: Object.prototype.hasOwnProperty.call(a, 'sizeBytes')
                  ? toNullableBigInt(a.sizeBytes ?? null)
                  : undefined,
              },
              select: { id: true },
            });
            assetId = updated.id;
          } else {
            const created = await tx.asset.create({
              data: {
                kind,
                type,
                title: a.title ?? null,
                url: kind === AssetKind.LINK ? (a.url ?? null) : null,
                filePath: kind === AssetKind.FILE ? (a.filePath ?? null) : null,
                mimeType: a.mimeType ?? null,
                sizeBytes: toNullableBigInt(a.sizeBytes ?? null),
              },
              select: { id: true },
            });
            assetId = created.id;
          }

          await tx.songAsset.create({
            data: { songId, assetId, label: a.label ?? null, sort, isPrimary },
          });
        }
      }

      // Versions
      if (hasVersions) {
        const incoming = Array.isArray(body.versions) ? body.versions : [];

        const norm = incoming
          .map((v) => {
            const year = this.normalizeYear(v?.year);

            const youtubeSearch = Object.prototype.hasOwnProperty.call(
              v ?? {},
              'youtubeSearch',
            )
              ? (v?.youtubeSearch ?? null)
              : null;

            const singerFrontNames = parseCsvNames(v?.singerFrontNames ?? '');
            const singerBackNames = parseCsvNames(v?.singerBackNames ?? '');
            const solistNames = parseCsvNames(v?.solistNames ?? '');

            const singerFrontIds = normalizeArtistIds(v?.singerFrontIds);
            const singerBackIds = normalizeArtistIds(v?.singerBackIds);
            const solistIds = normalizeArtistIds(v?.solistIds);

            const hasAny =
              year !== null ||
              (typeof youtubeSearch === 'string' &&
                youtubeSearch.trim() !== '') ||
              singerFrontIds.length > 0 ||
              singerBackIds.length > 0 ||
              solistIds.length > 0 ||
              singerFrontNames.length > 0 ||
              singerBackNames.length > 0 ||
              solistNames.length > 0;

            if (!hasAny) return null;

            return {
              year,
              youtubeSearch:
                typeof youtubeSearch === 'string' && youtubeSearch.trim() !== ''
                  ? youtubeSearch
                  : null,
              singerFrontNames,
              singerBackNames,
              solistNames,
              singerFrontIds,
              singerBackIds,
              solistIds,
            };
          })
          .filter((x): x is NonNullable<typeof x> => !!x);

        for (const v of norm) {
          const created = await tx.songVersion.create({
            data: { songId, year: v.year, youtubeSearch: v.youtubeSearch },
            select: { id: true },
          });
          const versionId = created.id;

          const finalSingerFrontIds =
            v.singerFrontIds.length > 0
              ? v.singerFrontIds
              : await this.upsertArtistsByTitlesTx(tx, v.singerFrontNames);

          const finalSingerBackIds =
            v.singerBackIds.length > 0
              ? v.singerBackIds
              : await this.upsertArtistsByTitlesTx(tx, v.singerBackNames);

          const finalSolistIds =
            v.solistIds.length > 0
              ? v.solistIds
              : await this.upsertArtistsByTitlesTx(tx, v.solistNames);

          await this.assertArtistsExistTx(
            tx,
            [...finalSingerFrontIds, ...finalSingerBackIds, ...finalSolistIds],
            `versionsJson(songId=${songId})`,
          );

          const rows: Array<{
            versionId: number;
            artistId: number;
            role: VersionArtistRole;
          }> = [];

          for (const artistId of finalSingerFrontIds) {
            rows.push({
              versionId,
              artistId,
              role: VersionArtistRole.SINGER_FRONT,
            });
          }
          for (const artistId of finalSingerBackIds) {
            rows.push({
              versionId,
              artistId,
              role: VersionArtistRole.SINGER_BACK,
            });
          }
          for (const artistId of finalSolistIds) {
            rows.push({ versionId, artistId, role: VersionArtistRole.SOLOIST });
          }

          if (rows.length) {
            await tx.songVersionArtist.createMany({
              data: rows,
              skipDuplicates: true,
            });
          }
        }
      }

      return songId;
    });

    // ✅ ES sync best-effort
    try {
      await this.esSync?.upsertSong(songId);
    } catch (e) {
      console.error('[SongsService] ES upsert failed', e);
    }

    return this.findOne(songId, true);
  }
}
