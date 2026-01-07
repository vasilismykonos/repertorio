// apps/api/src/songs/songs.controller.ts

import {
  Body,
  Controller,
  Get,
  GoneException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SongsService } from "./songs.service";
import { SongCreditsService } from "./song-credits.service";

type SongAssetBody = {
  id?: number;
  kind: any;
  type?: any;
  title?: string | null;
  url?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: string | number | bigint | null;

  label?: string | null;
  sort?: number | null;
  isPrimary?: boolean | null;
};

type SongVersionBody = {
  id?: number | null;
  year?: number | string | null;
  youtubeSearch?: string | null;

  // preferred: ids (array, CSV, or JSON string)
  singerFrontIds?: number[] | string | null;
  singerBackIds?: number[] | string | null;
  solistIds?: number[] | string | null;

  // backward compatible: comma-separated names
  singerFrontNames?: string | null;
  singerBackNames?: string | null;
  solistNames?: string | null;
};

type CreateOrUpdateSongBody = {
  title?: string;
  firstLyrics?: string | null;
  lyrics?: string | null;
  characteristics?: string | null;
  originalKey?: string | null;
  defaultKey?: string | null;
  chords?: string | null;
  status?: any;
  categoryId?: number | null;
  rythmId?: number | null;
  basedOnSongId?: number | null;
  scoreFile?: string | null;
  highestVocalNote?: string | null;

  tagIds?: number[] | null;
  assets?: SongAssetBody[] | null;
  versions?: SongVersionBody[] | null;
};

type SongFullMultipartBody = Record<string, any> & {
  // optional: a single JSON field with the whole payload
  json?: string;
  payload?: string;

  // optional: credits payload (JSON string) or direct arrays/CSV
  credits?: string;
  composerArtistIds?: unknown;
  lyricistArtistIds?: unknown;

  // optionally sent as JSON string fields
  tagIds?: unknown;
  assets?: unknown;
  versions?: unknown;
};

function isTruthyFlag(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function parseJsonSafe<T>(input: unknown, fallback: T): T {
  if (input == null) return fallback;
  if (typeof input !== "string") return fallback;
  const raw = input.trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizeIds(input: unknown): number[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input
      .map((x) => toNumberOrNull(x))
      .filter((n): n is number => n != null && n > 0);
  }
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return [];
    // JSON array?
    const jsonArr = parseJsonSafe<unknown>(raw, null);
    if (Array.isArray(jsonArr)) return normalizeIds(jsonArr);
    // CSV
    return raw
      .split(/[,\s]+/g)
      .map((x) => toNumberOrNull(x))
      .filter((n): n is number => n != null && n > 0);
  }
  return [];
}

function normalizeAssets(input: unknown): SongAssetBody[] | null {
  if (input == null) return null;
  if (Array.isArray(input)) return input as SongAssetBody[];
  if (typeof input === "string") {
    const parsed = parseJsonSafe<unknown>(input, null);
    if (Array.isArray(parsed)) return parsed as SongAssetBody[];
  }
  return null;
}

function normalizeVersions(input: unknown): SongVersionBody[] | null {
  if (input == null) return null;
  if (Array.isArray(input)) return input as SongVersionBody[];
  if (typeof input === "string") {
    const parsed = parseJsonSafe<unknown>(input, null);
    if (Array.isArray(parsed)) return parsed as SongVersionBody[];
  }
  return null;
}

function normalizeSongBodyFromMultipart(body: SongFullMultipartBody): {
  song: CreateOrUpdateSongBody;
  credits: { composerArtistIds: number[]; lyricistArtistIds: number[] } | null;
} {
  // Support a single JSON field that contains the whole song body.
  const jsonEnvelope =
    parseJsonSafe<Record<string, any>>(body.json, {}) ??
    parseJsonSafe<Record<string, any>>(body.payload, {});


  const src = (jsonEnvelope ?? body) as Record<string, any>;

  // tags/assets/versions may be sent as JSON strings by multipart forms.
  const tagIds =
    Array.isArray((src as any).tagIds) || typeof (src as any).tagIds === "string"
      ? normalizeIds((src as any).tagIds)
      : Array.isArray((src as any).tagIdsJson) || typeof (src as any).tagIdsJson === "string"
        ? normalizeIds((src as any).tagIdsJson)
        : normalizeIds((body as any).tagIds ?? (body as any).tagIdsJson);

  const assets = normalizeAssets(src.assets ?? body.assets);
  const versions = normalizeVersions(src.versions ?? body.versions);

  const song: CreateOrUpdateSongBody = {
    title: typeof src.title === "string" ? src.title : undefined,
    firstLyrics:
      typeof src.firstLyrics === "string" ? src.firstLyrics : (src.firstLyrics ?? undefined),
    lyrics: typeof src.lyrics === "string" ? src.lyrics : (src.lyrics ?? undefined),
    characteristics:
      typeof src.characteristics === "string"
        ? src.characteristics
        : (src.characteristics ?? undefined),
    originalKey:
      typeof src.originalKey === "string" ? src.originalKey : (src.originalKey ?? undefined),
    defaultKey:
      typeof src.defaultKey === "string" ? src.defaultKey : (src.defaultKey ?? undefined),
    chords: typeof src.chords === "string" ? src.chords : (src.chords ?? undefined),
    status: src.status ?? undefined,
    categoryId:
      src.categoryId === "" ? null : (toNumberOrNull(src.categoryId) ?? (src.categoryId ?? undefined)),
    rythmId:
      src.rythmId === "" ? null : (toNumberOrNull(src.rythmId) ?? (src.rythmId ?? undefined)),
    basedOnSongId:
      src.basedOnSongId === ""
        ? null
        : (toNumberOrNull(src.basedOnSongId) ?? (src.basedOnSongId ?? undefined)),
    scoreFile: typeof src.scoreFile === "string" ? src.scoreFile : (src.scoreFile ?? undefined),
    highestVocalNote:
      typeof src.highestVocalNote === "string"
        ? src.highestVocalNote
        : (src.highestVocalNote ?? undefined),

    tagIds: tagIds.length ? tagIds : (src.tagIds === null ? null : tagIds),
    assets: assets ?? (src.assets === null ? null : undefined),
    versions: versions ?? (src.versions === null ? null : undefined),
  };

  // Credits may be sent as a JSON string `credits` or direct fields
  const creditsJson =
    parseJsonSafe<Record<string, any>>((body as any).credits, {}) ??
    parseJsonSafe<Record<string, any>>((body as any).creditsJson, {});

  const compIds = normalizeIds(creditsJson?.composerArtistIds ?? body.composerArtistIds);
  const lyrIds = normalizeIds(creditsJson?.lyricistArtistIds ?? body.lyricistArtistIds);

  const credits =
    compIds.length || lyrIds.length
      ? { composerArtistIds: compIds, lyricistArtistIds: lyrIds }
      : creditsJson
        ? { composerArtistIds: compIds, lyricistArtistIds: lyrIds }
        : null;

  return { song, credits };
}

@Controller("songs")
export class SongsController {
  constructor(
    private readonly songsService: SongsService,
    private readonly songCreditsService: SongCreditsService,
  ) {}

  @Get(":id")
  async findOne(
    @Param("id", ParseIntPipe) id: number,
    @Query("noIncrement") noIncrement?: string,
  ) {
    const noInc = isTruthyFlag(noIncrement);
    return this.songsService.findOne(id, noInc);
  }

  /**
   * ✅ NEW ARCHITECTURE
   * Create a song (full payload) via multipart/form-data.
   *
   * - Supports either individual fields OR a single JSON envelope field (json/payload).
   * - Supports optional `credits` JSON field or direct composer/lyricist ids.
   * - Optional file is accepted for forward compatibility; currently unused.
   */
  @Post("full")
  @UseInterceptors(FileInterceptor("file"))
  async createSongFull(
    @Body() body: SongFullMultipartBody,
    @UploadedFile() _file?: Express.Multer.File,
  ) {
    const { song, credits } = normalizeSongBodyFromMultipart(body);
    const created = await this.songsService.createSong(song as any);

    if (credits) {
      await this.songCreditsService.replaceSongCredits(created.id, credits);
    }

    // Return fresh detail including credits set above (and without incrementing views).
    return this.songsService.findOne(created.id, true);
  }

  /**
   * ✅ NEW ARCHITECTURE
   * Update a song (full payload) via multipart/form-data.
   * See createSongFull for supported body formats.
   */
  @Patch(":id/full")
  @UseInterceptors(FileInterceptor("file"))
  async updateSongFull(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: SongFullMultipartBody,
    @UploadedFile() _file?: Express.Multer.File,
  ) {
    const { song, credits } = normalizeSongBodyFromMultipart(body);

    await this.songsService.updateSong(id, song as any);

    if (credits) {
      await this.songCreditsService.replaceSongCredits(id, credits);
    }

    return this.songsService.findOne(id, true);
  }

  /**
   * ❌ DEPRECATED (legacy split architecture)
   * Use POST /songs/full instead.
   */
  @Post()
  async createSongLegacy() {
    throw new GoneException("Deprecated endpoint. Use POST /songs/full.");
  }

  /**
   * ❌ DEPRECATED (legacy split architecture)
   * Use PATCH /songs/:id/full instead.
   */
  @Patch(":id")
  async updateSongLegacy() {
    throw new GoneException("Deprecated endpoint. Use PATCH /songs/:id/full.");
  }
}
