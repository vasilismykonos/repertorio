// apps/api/src/elasticsearch/elasticsearch-reindex.service.ts

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ReindexState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;

  total: number;
  processed: number;
  indexed: number;
  errors: number;

  lastId: number | null;
  message: string | null;
};

type PreviewItem = {
  id?: number | null;
  legacySongId?: number | null;

  title?: string | null;
  firstLyrics?: string | null;
  lyrics?: string | null;

  // legacy
  characteristics?: string | null;

  // ✅ ΝΕΟ: tags
  tagIds?: number[] | null;
  tagTitles?: string[] | null;
  tagSlugs?: string[] | null;

  originalKey?: string | null;

  categoryId?: number | null;
  rythmId?: number | null;

  categoryTitle?: string | null;
  rythmTitle?: string | null;

  // ✅ NEW: ids
  composerId?: number | null;
  lyricistId?: number | null;

  composerName?: string | null;
  lyricistName?: string | null;

  // ✅ NEW: createdBy
  createdById?: number | null;
  createdByName?: string | null;

  singerFrontNames?: string[] | null;
  singerBackNames?: string[] | null;

  years?: number[] | null;
  minYear?: number | null;
  maxYear?: number | null;
  yearText?: string | null;

  // ✅ συσχέτιση Α↔Β ανά version
  versionSingerPairs?: any[] | null;

  hasChords?: boolean | null;
  hasLyrics?: boolean | null;
  hasScore?: boolean | null;

  views?: number | null;
  status?: string | null;
  scoreFile?: string | null;
};

type PreviewResponse = {
  total: number;
  items: PreviewItem[];
};

@Injectable()
export class ElasticsearchReindexService {
  private readonly ES_BASE = process.env.ES_BASE_URL ?? 'http://127.0.0.1:9200';
  private readonly INDEX = process.env.ES_SONGS_INDEX ?? 'app_songs';
  private readonly BATCH_SIZE = 250;

  private state: ReindexState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    total: 0,
    processed: 0,
    indexed: 0,
    errors: 0,
    lastId: null,
    message: null,
  };

  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    return { ...this.state, esBase: this.ES_BASE, index: this.INDEX };
  }

  private textWithKeyword() {
    return {
      type: 'text',
      analyzer: 'el_text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    };
  }

  private kwWithText() {
    return {
      type: 'text',
      analyzer: 'el_text',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
        text: { type: 'text', analyzer: 'el_text' },
      },
    };
  }

  buildIndexBody() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        refresh_interval: '1s',
        analysis: {
          char_filter: {
            el_diacritics_map: {
              type: 'mapping',
              mappings: [
                'ά=>α',
                'έ=>ε',
                'ή=>η',
                'ί=>ι',
                'ό=>ο',
                'ύ=>υ',
                'ώ=>ω',
                'ϊ=>ι',
                'ΐ=>ι',
                'ϋ=>υ',
                'ΰ=>υ',
                'Ά=>Α',
                'Έ=>Ε',
                'Ή=>Η',
                'Ί=>Ι',
                'Ό=>Ο',
                'Ύ=>Υ',
                'Ώ=>Ω',
                'Ϊ=>Ι',
                'Ϋ=>Υ',
              ],
            },
          },
          analyzer: {
            el_text: {
              type: 'custom',
              char_filter: ['html_strip', 'el_diacritics_map'],
              tokenizer: 'standard',
              filter: ['lowercase'],
            },
          },
        },
      },
      mappings: {
        dynamic: true,
        properties: {
          id: { type: 'integer' },
          legacySongId: { type: 'integer' },

          title: { type: 'text', analyzer: 'el_text' },
          firstLyrics: { type: 'text', analyzer: 'el_text' },
          lyrics: { type: 'text', analyzer: 'el_text' },

          // legacy
          characteristics: this.textWithKeyword(),

          // ✅ Tags
          tagIds: { type: 'integer' },
          tagTitles: this.kwWithText(),
          tagSlugs: { type: 'keyword', ignore_above: 256 },

          categoryId: { type: 'integer' },
          rythmId: { type: 'integer' },

          categoryTitle: this.kwWithText(),
          rythmTitle: this.kwWithText(),

          // ✅ NEW: ids
          composerId: { type: 'integer' },
          lyricistId: { type: 'integer' },

          composerName: this.kwWithText(),
          lyricistName: this.kwWithText(),

          // ✅ NEW: createdBy
          createdById: { type: 'integer' },
          createdByName: this.kwWithText(),

          singerFrontNames: this.kwWithText(),
          singerBackNames: this.kwWithText(),

          years: { type: 'integer' },
          minYear: { type: 'integer' },
          maxYear: { type: 'integer' },
          yearText: this.kwWithText(),

          // ✅ Nested pairs Α↔Β ανά δισκογραφία/version
          versionSingerPairs: {
            type: 'nested',
            properties: {
              versionId: { type: 'integer' },
              year: { type: 'integer' },
              frontId: { type: 'integer' },
              backId: { type: 'integer' },
              frontName: this.kwWithText(),
              backName: this.kwWithText(),
            },
          },

          status: this.kwWithText(),
          scoreFile: this.kwWithText(),
          originalKey: this.kwWithText(),
          views: { type: 'integer' },

          hasChords: { type: 'boolean' },
          hasLyrics: { type: 'boolean' },
          hasScore: { type: 'boolean' },
        },
      },
    };
  }

  private async es(path: string, init?: RequestInit) {
    const url = `${this.ES_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetch(url, init);
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }
    if (!res.ok) {
      throw new HttpException(
        `ES ${res.status} ${url}: ${text.slice(0, 400)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { res, text, json };
  }

  private async indexExists(index: string): Promise<boolean> {
    try {
      const url = `${this.ES_BASE}/${encodeURIComponent(index)}`;
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async createIndex(index: string) {
    await this.es(`/${encodeURIComponent(index)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.buildIndexBody()),
    });
  }

  private async deleteIndex(index: string) {
    await this.es(`/${encodeURIComponent(index)}`, { method: 'DELETE' });
  }

  private async recreateIndex(index: string) {
    const exists = await this.indexExists(index);
    if (exists) await this.deleteIndex(index);
    await this.createIndex(index);
  }

  private async clearIndexDocs(index: string) {
    await this.es(
      `/${encodeURIComponent(index)}/_delete_by_query?conflicts=proceed&refresh=true`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: { match_all: {} } }),
      },
    );
  }

  private normalizeName(a: any): string {
    const t = String(a?.title ?? '').trim();
    if (t) return t;

    const f = String(a?.firstName ?? '').trim();
    const l = String(a?.lastName ?? '').trim();
    return `${f} ${l}`.trim();
  }

  private uniqStrings(arr: string[]) {
    return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
  }

  /**
   * ✅ ΣΩΣΤΟ: οι τραγουδιστές βρίσκονται στα versions[].artists[]
   */
  private computeSingersFromVersions(versions: any[]) {
    const singerFrontNames: string[] = [];
    const singerBackNames: string[] = [];

    for (const v of versions ?? []) {
      for (const va of v?.artists ?? []) {
        const role = String(va?.role ?? '');
        const artist = va?.artist ?? null;
        if (!artist) continue;

        const name = this.normalizeName(artist);
        if (!name) continue;

        if (role === 'SINGER_FRONT') singerFrontNames.push(name);
        if (role === 'SINGER_BACK') singerBackNames.push(name);
      }
    }

    return {
      singerFrontNames: this.uniqStrings(singerFrontNames),
      singerBackNames: this.uniqStrings(singerBackNames),
    };
  }

  private computeVersionMeta(versions: any[]) {
    const years: number[] = [];
    const pairs: any[] = [];

    for (const v of versions ?? []) {
      const year = typeof v?.year === 'number' ? v.year : null;
      if (year && Number.isFinite(year)) years.push(year);

      // front/back ids/names per version
      const frontArtists: any[] = [];
      const backArtists: any[] = [];

      for (const va of v?.artists ?? []) {
        const role = String(va?.role ?? '');
        const artist = va?.artist ?? null;
        if (!artist) continue;

        if (role === 'SINGER_FRONT') frontArtists.push(artist);
        if (role === 'SINGER_BACK') backArtists.push(artist);
      }

      // Cartesian pairs per version
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

  /**
   * ✅ credits: επιστρέφει ids + names (first composer/first lyricist)
   */
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

  private computeFirstLyrics(s: any): string | null {
    const fl = String(s?.firstLyrics ?? '').trim();
    if (fl) return fl;

    const lyrics = String(s?.lyrics ?? '').trim();
    if (!lyrics) return null;

    const firstLine = lyrics
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find(Boolean);
    return firstLine ?? null;
  }

  private async bulkIndexBatch(index: string, rows: any[]) {
    const lines: string[] = [];
    let batchErrors = 0;

    for (const s of rows) {
      const lyrics = String(s?.lyrics ?? '').trim() || null;
      const computedFirstLyrics = this.computeFirstLyrics(s);

      const hasChords = !!String(s?.chords ?? '').trim();
      const hasLyrics = !!lyrics;
      const hasScore = !!String(s?.scoreFile ?? '').trim();

      const categoryTitle = String(s?.category?.title ?? '').trim() || null;
      const rythmTitle = String(s?.rythm?.title ?? '').trim() || null;

      const { composerName, lyricistName, composerId, lyricistId } =
        this.computeCredits(s.credits);

      const { singerFrontNames, singerBackNames } =
        this.computeSingersFromVersions(s.versions);

      const { years, minYear, maxYear, yearText, versionSingerPairs } =
        this.computeVersionMeta(s.versions);

      const createdById =
        typeof s?.createdByUserId === 'number' ? s.createdByUserId : null;

      const createdByNameRaw = String(s?.createdBy?.displayName ?? '').trim();
      const createdByName = createdByNameRaw ? createdByNameRaw : null;

      lines.push(
        JSON.stringify({ index: { _index: index, _id: String(s.id) } }),
      );
      lines.push(
        JSON.stringify({
          id: s.id,
          legacySongId: s.legacySongId ?? null,

          title: s.title ?? null,
          firstLyrics: computedFirstLyrics,
          lyrics: lyrics ?? null,

          characteristics: s.characteristics ?? null,

          tagIds: Array.isArray(s.SongTag)
            ? s.SongTag.map((st: any) => Number(st?.tagId)).filter(
                (n: any) => Number.isFinite(n) && n > 0,
              )
            : [],
          tagTitles: Array.isArray(s.SongTag)
            ? s.SongTag.map((st: any) =>
                String(st?.Tag?.title ?? '').trim(),
              ).filter((t: any) => t)
            : [],
          tagSlugs: Array.isArray(s.SongTag)
            ? s.SongTag.map((st: any) =>
                String(st?.Tag?.slug ?? '').trim(),
              ).filter((t: any) => t)
            : [],

          categoryId: s.categoryId ?? null,
          categoryTitle,

          rythmId: s.rythmId ?? null,
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

          years,
          minYear,
          maxYear,
          yearText,
          versionSingerPairs,

          status: s.status ?? null,
          scoreFile: s.scoreFile ?? null,
          originalKey: s.originalKey ?? null,
          views: typeof s.views === 'number' ? s.views : 0,

          hasChords,
          hasLyrics,
          hasScore,
        }),
      );
    }

    const bulkBody = `${lines.join('\n')}\n`;

    const { json } = await this.es(
      `/${encodeURIComponent(index)}/_bulk?refresh=false`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-ndjson' },
        body: bulkBody,
      },
    );

    if (json?.errors) {
      const items = json?.items ?? [];
      for (const it of items) {
        const idx = it?.index;
        if (idx?.error) batchErrors += 1;
      }
    }

    return { batchErrors };
  }

  async startReindexNow(opts: { recreate?: boolean } = {}) {
    if (this.state.running) {
      return {
        ok: false,
        message: 'Reindex already running',
        state: this.getStatus(),
      };
    }

    this.state = {
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      total: 0,
      processed: 0,
      indexed: 0,
      errors: 0,
      lastId: null,
      message: `Starting reindex... (esBase=${this.ES_BASE}, index=${this.INDEX}, recreate=${!!opts?.recreate})`,
    };

    const index = this.INDEX;

    (async () => {
      try {
        this.state.message = 'Checking index...';
        const exists = await this.indexExists(index);

        if (!exists) {
          this.state.message = 'Creating index...';
          await this.createIndex(index);
        } else if (opts.recreate) {
          this.state.message = 'Recreating index...';
          await this.recreateIndex(index);
        }

        this.state.message = 'Clearing documents...';
        await this.clearIndexDocs(index);

        this.state.message = 'Counting songs in Postgres...';
        this.state.total = await this.prisma.song.count();

        this.state.message = 'Indexing...';
        let lastId = 0;

        while (true) {
          const rows = await this.prisma.song.findMany({
            where: { id: { gt: lastId } },
            orderBy: { id: 'asc' },
            take: this.BATCH_SIZE,
            select: {
              id: true,
              legacySongId: true,
              title: true,
              firstLyrics: true,
              lyrics: true,
              chords: true,
              characteristics: true,
              categoryId: true,
              rythmId: true,
              views: true,
              scoreFile: true,
              status: true,
              originalKey: true,

              // ✅ NEW: createdBy
              createdByUserId: true,
              createdBy: { select: { id: true, displayName: true } },

              SongTag: {
                select: {
                  tagId: true,
                  Tag: { select: { id: true, title: true, slug: true } },
                },
              },

              category: { select: { title: true } },
              rythm: { select: { title: true } },

              credits: {
                select: {
                  role: true,
                  artist: {
                    select: {
                      id: true,
                      title: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },

              versions: {
                select: {
                  id: true,
                  year: true,
                  artists: {
                    select: {
                      role: true,
                      artist: {
                        select: {
                          id: true,
                          title: true,
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          if (!rows.length) break;

          const { batchErrors } = await this.bulkIndexBatch(index, rows);

          this.state.processed += rows.length;
          this.state.errors += batchErrors;
          this.state.indexed += rows.length;

          lastId = rows[rows.length - 1]?.id ?? lastId;
          this.state.lastId = lastId;
          this.state.message = `Indexing... lastId=${lastId} (batchErrors=${batchErrors})`;
        }

        this.state.message = 'Refreshing index...';
        await this.es(`/${encodeURIComponent(index)}/_refresh`, {
          method: 'POST',
        });

        this.state.running = false;
        this.state.finishedAt = new Date().toISOString();
        this.state.message = 'Done';
      } catch (e: any) {
        this.state.running = false;
        this.state.finishedAt = new Date().toISOString();
        this.state.message = `FAILED: ${e?.message ?? String(e)}`;
      }
    })();

    return { ok: true, message: 'Reindex started', state: this.getStatus() };
  }

  async preview(take = 25): Promise<PreviewResponse> {
    const index = this.INDEX;

    const { json } = await this.es(`/${encodeURIComponent(index)}/_search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        size: Math.max(1, Math.min(200, Math.trunc(Number(take) || 25))),
        sort: [{ id: { order: 'asc' } }],
        _source: [
          'id',
          'legacySongId',
          'title',
          'firstLyrics',
          'lyrics',
          'characteristics',
          'tagIds',
          'tagTitles',
          'tagSlugs',
          'originalKey',
          'categoryId',
          'categoryTitle',
          'rythmId',
          'rythmTitle',

          'composerId',
          'lyricistId',
          'composerName',
          'lyricistName',

          // ✅ NEW: createdBy
          'createdById',
          'createdByName',

          'singerFrontNames',
          'singerBackNames',
          'minYear',
          'maxYear',
          'yearText',
          'views',
          'status',
          'scoreFile',
          'hasChords',
          'hasLyrics',
          'hasScore',
        ],
        query: { match_all: {} },
      }),
    });

    const hits = json?.hits?.hits ?? [];
    const total = json?.hits?.total?.value ?? 0;
    const items = hits.map((h: any) => h?._source ?? {});

    return { total, items };
  }
}
