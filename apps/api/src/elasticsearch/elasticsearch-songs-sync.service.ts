// apps/api/src/elasticsearch/elasticsearch-songs-sync.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ElasticsearchSongsSyncService {
  private readonly logger = new Logger(ElasticsearchSongsSyncService.name);

  private readonly ES_BASE = (
    process.env.ES_BASE_URL ?? 'http://127.0.0.1:9200'
  ).replace(/\/$/, '');
  private readonly INDEX = process.env.ES_SONGS_INDEX ?? 'app_songs';

  /**
   * Αν ES_SYNC_STRICT=1 => αν αποτύχει το ES, κάνουμε throw.
   * Default: best-effort (log error, αλλά το save δεν χαλάει).
   */
  private readonly strict =
    String(process.env.ES_SYNC_STRICT ?? '').trim() === '1';

  constructor(private readonly prisma: PrismaService) {}

  private async es(path: string, init?: RequestInit) {
    const url = `${this.ES_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

    const headers = new Headers(init?.headers ?? {});
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const res = await fetch(url, { ...init, headers });
    const text = await res.text().catch(() => '');

    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return { res, text, json };
  }

  private normalizeName(artist: any): string | null {
    const title = String(artist?.title ?? '').trim();
    if (title) return title;

    const name = String(artist?.name ?? '').trim();
    if (name) return name;

    const fullName = String(artist?.fullName ?? '').trim();
    if (fullName) return fullName;

    const first = String(artist?.firstName ?? '').trim();
    const last = String(artist?.lastName ?? '').trim();
    const fl = `${first} ${last}`.trim();
    if (fl) return fl;

    return null;
  }

  private uniqStrings(arr: string[]) {
    return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
  }

  private computeFirstLyrics(song: any): string | null {
    const fl = String(song?.firstLyrics ?? '').trim();
    if (fl) return fl;

    const lyrics = String(song?.lyrics ?? '').trim();
    if (!lyrics) return null;

    const firstLine = lyrics
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find(Boolean);

    return firstLine ?? null;
  }

  private computeCredits(credits: any[]) {
    let composerName: string | null = null;
    let lyricistName: string | null = null;

    let composerId: number | null = null;
    let lyricistId: number | null = null;

    for (const c of credits ?? []) {
      const role = String(c?.role ?? '');
      const artist = c?.artist ?? null;
      if (!artist) continue;

      const name = this.normalizeName(artist);
      const id = Number(artist?.id);

      if (role === 'COMPOSER' && !composerName) {
        composerName = name || null;
        if (Number.isFinite(id) && id > 0) composerId = id;
      }

      if (role === 'LYRICIST' && !lyricistName) {
        lyricistName = name || null;
        if (Number.isFinite(id) && id > 0) lyricistId = id;
      }
    }

    return { composerName, lyricistName, composerId, lyricistId };
  }

  private computeDiscographySingersFromVersions(versions: any[]) {
    const allFront: string[] = [];
    const allBack: string[] = [];

    const discographies: Array<{
      versionId: number | null;
      year: number | null;
      singerFrontNames: string[];
      singerBackNames: string[];
    }> = [];

    for (const v of versions ?? []) {
      const vFront: string[] = [];
      const vBack: string[] = [];

      for (const va of v?.artists ?? []) {
        const role = String(va?.role ?? '');
        const artist = va?.artist ?? null;
        if (!artist) continue;

        const name = this.normalizeName(artist);
        if (!name) continue;

        if (role === 'SINGER_FRONT') {
          vFront.push(name);
          allFront.push(name);
        }
        if (role === 'SINGER_BACK') {
          vBack.push(name);
          allBack.push(name);
        }
      }

      const frontUniq = this.uniqStrings(vFront);
      const backUniq = this.uniqStrings(vBack);

      if (frontUniq.length || backUniq.length) {
        discographies.push({
          versionId: Number(v?.id) || null,
          year: typeof v?.year === 'number' ? v.year : null,
          singerFrontNames: frontUniq,
          singerBackNames: backUniq,
        });
      }
    }

    return {
      singerFrontNames: this.uniqStrings(allFront),
      singerBackNames: this.uniqStrings(allBack),
      discographies,
    };
  }

  private computeVersionMeta(versions: any[]) {
    const years: number[] = [];
    const pairs: any[] = [];

    for (const v of versions ?? []) {
      const year = typeof v?.year === 'number' ? v.year : null;
      if (year && Number.isFinite(year)) years.push(year);

      const frontArtists: any[] = [];
      const backArtists: any[] = [];

      for (const va of v?.artists ?? []) {
        const role = String(va?.role ?? '');
        const artist = va?.artist ?? null;
        if (!artist) continue;

        if (role === 'SINGER_FRONT') frontArtists.push(artist);
        if (role === 'SINGER_BACK') backArtists.push(artist);
      }

      for (const fa of frontArtists) {
        for (const ba of backArtists) {
          const frontId = Number(fa?.id);
          const backId = Number(ba?.id);
          if (!Number.isFinite(frontId) || !Number.isFinite(backId)) continue;

          pairs.push({
            versionId: Number(v?.id) || null,
            year: year ?? null,
            frontId,
            backId,
            frontName: this.normalizeName(fa),
            backName: this.normalizeName(ba),
          });
        }
      }
    }

    const yearsUniq = Array.from(
      new Set(years.filter((y) => Number.isFinite(y))),
    ).sort((a, b) => a - b);
    const minYear = yearsUniq.length ? yearsUniq[0] : null;
    const maxYear = yearsUniq.length ? yearsUniq[yearsUniq.length - 1] : null;

    const yearText =
      yearsUniq.length === 0
        ? null
        : yearsUniq.length === 1
          ? String(yearsUniq[0])
          : `${yearsUniq[0]}-${yearsUniq[yearsUniq.length - 1]}`;

    return {
      years: yearsUniq,
      minYear,
      maxYear,
      yearText,
      versionSingerPairs: pairs,
    };
  }

  private async buildEsDoc(songId: number) {
    const s = await this.prisma.song.findUnique({
      where: { id: songId },
      include: {
        category: true,
        rythm: true,
        credits: { include: { artist: true } },
        versions: { include: { artists: { include: { artist: true } } } },

        // ✅ NEW: createdBy
        createdBy: { select: { id: true, displayName: true } },

        SongTag: {
          include: { Tag: { select: { id: true, title: true, slug: true } } },
          orderBy: [{ tagId: 'asc' }],
        },
      },
    });

    if (!s) return null;

    const lyrics = Object.prototype.hasOwnProperty.call(s, 'lyrics')
      ? String((s as any).lyrics ?? '').trim() || null
      : null;

    const computedFirstLyrics = this.computeFirstLyrics(s);

    const hasChords = !!String((s as any).chords ?? '').trim();
    const hasLyrics = !!String((s as any).lyrics ?? '').trim();
    const hasScore =
      Boolean((s as any).hasScore) ||
      !!String((s as any).scoreFile ?? '').trim();

    const categoryTitle = String(s?.category?.title ?? '').trim() || null;
    const rythmTitle = String(s?.rythm?.title ?? '').trim() || null;

    const { composerName, lyricistName, composerId, lyricistId } =
      this.computeCredits(s.credits);

    const { singerFrontNames, singerBackNames, discographies } =
      this.computeDiscographySingersFromVersions(s.versions);

    const { years, minYear, maxYear, yearText, versionSingerPairs } =
      this.computeVersionMeta(s.versions);

    const createdById =
      typeof (s as any).createdByUserId === 'number'
        ? (s as any).createdByUserId
        : null;

    const createdByNameRaw = String(
      (s as any)?.createdBy?.displayName ?? '',
    ).trim();
    const createdByName = createdByNameRaw ? createdByNameRaw : null;

    return {
      id: s.id,
      legacySongId: (s as any).legacySongId ?? null,

      title: (s as any).title ?? null,
      firstLyrics: computedFirstLyrics,
      lyrics: lyrics ?? null,

      characteristics: (s as any).characteristics ?? null,

      tagIds: Array.isArray((s as any).SongTag)
        ? (s as any).SongTag.map((st: any) => Number(st?.tagId)).filter(
            (n: any) => Number.isFinite(n) && n > 0,
          )
        : [],
      tagTitles: Array.isArray((s as any).SongTag)
        ? (s as any).SongTag.map((st: any) =>
            String(st?.Tag?.title ?? '').trim(),
          ).filter((t: any) => t)
        : [],
      tagSlugs: Array.isArray((s as any).SongTag)
        ? (s as any).SongTag.map((st: any) =>
            String(st?.Tag?.slug ?? '').trim(),
          ).filter((t: any) => t)
        : [],

      categoryId: (s as any).categoryId ?? null,
      categoryTitle,

      rythmId: (s as any).rythmId ?? null,
      rythmTitle,

      composerId: composerId ?? null,
      lyricistId: lyricistId ?? null,
      composerName,
      lyricistName,

      // ✅ NEW: createdBy
      createdById,
      createdByName,

      singerFrontNames,
      singerBackNames,
      discographies,

      years,
      minYear,
      maxYear,
      yearText,
      versionSingerPairs,

      status: (s as any).status ?? null,
      scoreFile: (s as any).scoreFile ?? null,
      originalKey: (s as any).originalKey ?? null,
      views: typeof (s as any).views === 'number' ? (s as any).views : 0,

      hasChords,
      hasLyrics,
      hasScore,
    };
  }

  async upsertSong(songId: number): Promise<void> {
    if (!Number.isFinite(songId) || songId <= 0) return;

    const doc = await this.buildEsDoc(songId);

    if (!doc) {
      await this.deleteSong(songId);
      return;
    }

    const { res, text } = await this.es(
      `/${encodeURIComponent(this.INDEX)}/_doc/${encodeURIComponent(String(songId))}`,
      {
        method: 'PUT',
        body: JSON.stringify(doc),
      },
    );

    if (!res.ok) {
      const msg = `ES upsert failed songId=${songId} HTTP ${res.status}: ${text}`;
      if (this.strict) throw new Error(msg);
      this.logger.error(msg);
      return;
    }

    this.logger.debug(`ES upsert ok songId=${songId}`);
  }

  async deleteSong(songId: number): Promise<void> {
    const { res, text } = await this.es(
      `/${encodeURIComponent(this.INDEX)}/_doc/${encodeURIComponent(String(songId))}`,
      { method: 'DELETE' },
    );

    if (res.ok || res.status === 404) return;

    const msg = `ES delete failed songId=${songId} HTTP ${res.status}: ${text}`;
    if (this.strict) throw new Error(msg);
    this.logger.error(msg);
  }
}
