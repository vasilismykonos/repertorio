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
  scoreFile: string | null;
  hasScore: boolean;

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

  // legacy/compat
  characteristics?: string | null;

  originalKey?: string | null;
  originalKeySign?: '+' | '-' | null;
  chords?: string | null;

  status?: SongStatus;
  categoryId?: number | null;
  rythmId?: number | null;
  basedOnSongId?: number | null;

  scoreFile?: string | null;
  highestVocalNote?: string | null;

  createdByUserId?: number | null;

  // ✅ NEW (tags replace-all)
  tagIds?: number[] | null;

  // ✅ NEW (assets replace-all)
  assets?: Array<{
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
  }> | null;

  // ✅ NEW (discographies/versions replace-all)
  versions?: Array<{
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
  }> | null;
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
  // (γιατί είπες "NULL όταν δεν προκύπτει πρόσημο")
  if (last[3] !== '+' && last[3] !== '-') return null;

  return last[3] === '-' ? '-' : '+';
}

@Injectable()
export class SongsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly esSync?: ElasticsearchSongsSyncService,
  ) {}

  /**
   * Επιστρέφει 1 τραγούδι σε DTO συμβατό με το SongDetail του Next.
   * Αν noIncrement=true δεν αυξάνει τα views.
   */
  async findOne(id: number, noIncrement = false): Promise<SongDetailDto> {
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

    if (!noIncrement) {
      await this.prisma.song.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }

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

    const tags: TagDto[] = (song.SongTag ?? [])
      .map((st) => st.Tag)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, title: t.title, slug: t.slug }));

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

    const createdByUserId = song.createdByUserId ?? song.createdBy?.id ?? null;
    const createdByDisplayName =
      song.createdBy?.displayName?.trim() ||
      song.createdBy?.username?.trim() ||
      null;

    return {
      id: song.id,
      legacySongId: song.legacySongId,
      scoreFile: song.scoreFile ?? null,
      hasScore: song.hasScore ?? false,

      title: song.title,
      firstLyrics: song.firstLyrics ?? null,
      lyrics: song.lyrics ?? null,

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

  async updateSong(id: number, body: UpdateSongBody) {
    const existing = await this.prisma.song.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Song with id=${id} not found`);
    }

    const data: any = {};

    // --- core fields ---
    if (typeof body.title === 'string') data.title = body.title;

    // ✅ lyrics -> firstLyrics (only if lyrics is provided)
    if (Object.prototype.hasOwnProperty.call(body, 'lyrics')) {
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

    if (Object.prototype.hasOwnProperty.call(body, 'scoreFile')) {
      data.scoreFile = body.scoreFile;
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

        await tx.songTag.deleteMany({ where: { songId: id } });

        if (ids.length > 0) {
          await tx.songTag.createMany({
            data: ids.map((tagId) => ({ songId: id, tagId })),
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

        // (D) Τελική διαγραφή Song
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

    if (typeof body.title === 'string' && body.title.trim() !== '') {
      data.title = body.title.trim();
    } else {
      throw new BadRequestException('title is required for new song');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'lyrics')) {
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

    if (Object.prototype.hasOwnProperty.call(body, 'scoreFile')) {
      data.scoreFile = body.scoreFile;
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

        if (ids.length > 0) {
          await tx.songTag.createMany({
            data: ids.map((tagId) => ({ songId, tagId })),
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
