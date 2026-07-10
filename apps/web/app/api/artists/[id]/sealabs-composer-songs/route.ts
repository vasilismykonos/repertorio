import { Buffer } from "node:buffer";
import * as https from "node:https";
import { NextRequest, NextResponse } from "next/server";

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const SEALABS_BASE_URL = "https://rebetiko.sealabs.net";
const FETCH_TIMEOUT_MS = 8000;
const SEALABS_LENGTH = 10000;
const SONGS_PAGE_SIZE = 100;
const EXISTING_TITLE_SCORE = 86;

type ArtistDetail = {
  id: number;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
};

type SongIndexItem = {
  id: number;
  title: string | null;
  composerName?: string | null;
  lyricistName?: string | null;
};

type SongsSearchResponse = {
  total?: number;
  items?: SongIndexItem[];
};

type SealabsOption = {
  value: string;
  label: string;
};

type SealabsRow = {
  id?: string;
  rec_id?: string;
  name?: string;
  titlos?: string;
  mousiki?: string;
  stixoi?: string;
  stixourgos?: string;
  tragoudistis?: string;
  etosixog?: string;
  info?: string;
  mitradiskos?: string;
  [key: string]: unknown;
};

type CandidateGroup = {
  title: string;
  normalizedTitle: string;
  sourceUrl: string;
  composers: Set<string>;
  lyricists: Set<string>;
  singers: Set<string>;
  years: Set<string>;
  catalogNumbers: Set<string>;
  infoLines: string[];
  recordings: number;
};

type IndexedSong = SongIndexItem & {
  normalizedTitle: string;
  coreTitle: string;
  titleWords: string[];
};

type SongTitleIndex = {
  byWord: Map<string, IndexedSong[]>;
  singleWordSongs: IndexedSong[];
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function decodeHtmlEntities(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function stripHtml(value: unknown): string {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const TITLE_STOPWORDS = new Set([
  "ο",
  "η",
  "το",
  "οι",
  "τα",
  "τον",
  "την",
  "του",
  "της",
  "των",
  "στο",
  "στη",
  "στην",
  "στον",
  "σε",
  "με",
  "και",
  "κι",
  "γι",
  "για",
  "γιατι",
  "αυτο",
  "αυτη",
  "αυτος",
  "μου",
  "σου",
  "μας",
  "σας",
]);

function titleCore(value: unknown): string {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length > 1 && !TITLE_STOPWORDS.has(word))
    .join(" ");
}

function cleanTitle(value: unknown): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function cleanName(value: unknown): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/^[\-–—:•·]+|[\-–—:•·]+$/g, "")
    .trim();
}

function splitNames(value: unknown): string[] {
  const text = cleanName(value);
  if (!text) return [];
  return uniqueStrings(
    text
      .replace(/\s+(?:και|&)\s+/gi, ",")
      .split(/[,;/|]+/g)
      .map((item) => item.trim()),
  );
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = cleanName(value);
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function titleScore(a: unknown, b: unknown): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 92;

  const ca = titleCore(a);
  const cb = titleCore(b);
  if (ca && cb) {
    if (ca === cb) return 98;
    const shorterCore = ca.length <= cb.length ? ca : cb;
    const longerCore = ca.length > cb.length ? ca : cb;
    const shorterCoreWords = shorterCore.split(" ").filter(Boolean).length;
    if ((shorterCoreWords >= 2 || shorterCore.length >= 8) && longerCore.includes(shorterCore)) return 94;
  }

  const aw = new Set(na.split(" ").filter(Boolean));
  const bw = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...aw].filter((word) => bw.has(word)).length;
  const union = new Set([...aw, ...bw]).size || 1;
  const jaccard = (intersection / union) * 100;

  const coreJaccard =
    ca && cb
      ? (() => {
          const acw = new Set(ca.split(" ").filter(Boolean));
          const bcw = new Set(cb.split(" ").filter(Boolean));
          const coreIntersection = [...acw].filter((word) => bcw.has(word)).length;
          const coreUnion = new Set([...acw, ...bcw]).size || 1;
          return (coreIntersection / coreUnion) * 100;
        })()
      : 0;

  return Math.round(Math.max(jaccard, coreJaccard, bigramDiceScore(na, nb)));
}

function bigramDiceScore(a: string, b: string): number {
  const aa = a.replace(/\s+/g, " ");
  const bb = b.replace(/\s+/g, " ");
  if (aa.length < 2 || bb.length < 2) return 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < aa.length - 1; i += 1) {
    const gram = aa.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < bb.length - 1; i += 1) {
    const gram = bb.slice(i, i + 2);
    const count = counts.get(gram) ?? 0;
    if (count <= 0) continue;
    counts.set(gram, count - 1);
    intersection += 1;
  }

  return (2 * intersection * 100) / ((aa.length - 1) + (bb.length - 1));
}

function fetchSealabsText(
  pathOrUrl: string,
  options: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string> } = {},
  redirects = 0,
): Promise<string> {
  const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(pathOrUrl, SEALABS_BASE_URL);
  if (url.hostname !== "rebetiko.sealabs.net") {
    return Promise.reject(new Error("Unexpected Sealabs host"));
  }

  const method = options.method ?? "GET";
  const headers: Record<string, string | number> = {
    Accept: "text/html,application/xhtml+xml,application/json",
    "User-Agent": "Mozilla/5.0 (compatible; RepertorioSealabsComposerTool/1.0; +https://repertorio.net)",
    ...options.headers,
  };

  if (options.body) headers["Content-Length"] = Buffer.byteLength(options.body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers,
        rejectUnauthorized: false,
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        if ([301, 302, 303, 307, 308].includes(status) && location && redirects < 3) {
          res.resume();
          const nextUrl = new URL(location, url).toString();
          resolve(fetchSealabsText(nextUrl, { ...options, method: status === 303 ? "GET" : method }, redirects + 1));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            reject(new Error(`Sealabs HTTP ${status}`));
            return;
          }
          resolve(text);
        });
      },
    );

    req.on("timeout", () => req.destroy(new Error("Sealabs request timed out")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function extractAttribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, "i"));
  return decodeHtmlEntities(match?.[1] ?? "");
}

function extractComposerOptions(html: string): SealabsOption[] {
  const select = html.match(/<select[^>]+\bname=["']composer["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const options: SealabsOption[] = [];
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(select)) !== null) {
    const label = cleanName(match[2]);
    const value = cleanName(extractAttribute(match[1], "value") || label);
    if (!value || !label) continue;
    options.push({ value, label });
  }
  return options;
}

function artistAliases(artist: ArtistDetail): string[] {
  const first = cleanName(artist.firstName);
  const last = cleanName(artist.lastName);
  const title = cleanName(artist.title);
  const aliases = [title, `${first} ${last}`.trim(), `${last} ${first}`.trim()];

  const firstInitial = first.charAt(0);
  if (last && firstInitial) {
    aliases.push(`${last} ${firstInitial}.`);
    aliases.push(`${last} ${firstInitial}`);
  }

  return uniqueStrings(aliases);
}

function findComposerOption(options: SealabsOption[], artist: ArtistDetail): SealabsOption | null {
  const aliases = artistAliases(artist);
  const normalizedAliases = aliases.map(normalizeText).filter(Boolean);
  const last = normalizeText(artist.lastName);
  const firstInitial = normalizeText(cleanName(artist.firstName).charAt(0));

  let best: { option: SealabsOption; score: number } | null = null;
  for (const option of options) {
    const optionKey = normalizeText(option.value || option.label);
    if (!optionKey) continue;

    for (const alias of normalizedAliases) {
      const score = titleScore(optionKey, alias);
      if (!best || score > best.score) best = { option, score };
      if (score >= 96) return option;
    }

    if (last && firstInitial && optionKey.includes(last) && optionKey.split(" ").includes(firstInitial)) {
      return option;
    }
  }

  return best && best.score >= 90 ? best.option : null;
}

function buildSealabsComposerBody(composer: string): string {
  const params = new URLSearchParams({
    draw: "1",
    start: "0",
    length: String(SEALABS_LENGTH),
    "search[value]": "",
    "search[regex]": "false",
    id_xristi: "1",
    compos_query: "",
    searchstring: "",
    recid: "",
    date_span: "",
    composer,
    singer: "",
    artist: "",
    "order[0][column]": "0",
    "order[0][dir]": "asc",
  });

  const columns = [
    "listsequence",
    "titlos",
    "mousiki",
    "tragoudistis",
    "etosixog",
    "info",
    "mitradiskos",
    "pros8iki",
    "pros8eta",
  ];

  columns.forEach((column, index) => {
    params.set(`columns[${index}][data]`, column);
    params.set(`columns[${index}][name]`, "");
    params.set(`columns[${index}][searchable]`, "true");
    params.set(`columns[${index}][orderable]`, "true");
    params.set(`columns[${index}][search][value]`, "");
    params.set(`columns[${index}][search][regex]`, "false");
  });

  return params.toString();
}

async function fetchSealabsComposerRows(composer: string): Promise<{ rows: SealabsRow[]; total: number }> {
  const text = await fetchSealabsText("/server_processing.php", {
    method: "POST",
    body: buildSealabsComposerBody(composer),
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const parsed = JSON.parse(text) as { data?: SealabsRow[]; recordsFiltered?: number; recordsTotal?: number };
  return {
    rows: Array.isArray(parsed.data) ? parsed.data : [],
    total: Number(parsed.recordsFiltered ?? parsed.recordsTotal ?? parsed.data?.length ?? 0),
  };
}

async function fetchAllSongs(): Promise<SongIndexItem[]> {
  const out: SongIndexItem[] = [];
  let total = Infinity;
  for (let skip = 0; skip < total; skip += SONGS_PAGE_SIZE) {
    const page = await fetchJson<SongsSearchResponse>(`/songs-es/search?take=${SONGS_PAGE_SIZE}&skip=${skip}`);
    const items = Array.isArray(page.items) ? page.items : [];
    out.push(...items);
    total = Number.isFinite(Number(page.total)) ? Number(page.total) : out.length;
    if (items.length === 0) break;
  }
  return out;
}

function buildSongTitleIndex(songs: SongIndexItem[]): SongTitleIndex {
  const byWord = new Map<string, IndexedSong[]>();
  const singleWordSongs: IndexedSong[] = [];

  for (const song of songs) {
    const normalizedTitle = normalizeText(song.title);
    if (!normalizedTitle) continue;
    const coreTitle = titleCore(song.title);
    const titleWords = [...new Set(`${normalizedTitle} ${coreTitle}`.split(" ").filter((word) => word.length > 1))];
    const indexed: IndexedSong = { ...song, normalizedTitle, coreTitle, titleWords };

    if (titleWords.length <= 1) singleWordSongs.push(indexed);
    for (const word of new Set(titleWords)) {
      const bucket = byWord.get(word) ?? [];
      bucket.push(indexed);
      byWord.set(word, bucket);
    }
  }

  return { byWord, singleWordSongs };
}

function parseSealabsCredits(row: SealabsRow): { composers: string[]; lyricists: string[] } {
  const musicText = cleanName(row.mousiki);
  const parenthetical = musicText.match(/^(.+?)\s*\((.+?)\)\s*$/);
  const composers = parenthetical ? splitNames(parenthetical[1]) : splitNames(musicText);
  const lyricists = uniqueStrings([
    ...(parenthetical ? splitNames(parenthetical[2]) : []),
    ...splitNames(row.stixoi),
    ...splitNames(row.stixourgos),
  ]);
  return { composers, lyricists };
}

function sourceUrlForRow(row: SealabsRow): string {
  const direct = String(row[0] ?? "");
  if (direct.startsWith("https://rebetiko.sealabs.net/")) return direct;
  const id = String(row.id ?? row.rec_id ?? "").trim();
  return id ? `${SEALABS_BASE_URL}/display.php?recid=${encodeURIComponent(id)}` : `${SEALABS_BASE_URL}/select_song.php`;
}

function groupSealabsRows(rows: SealabsRow[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();

  for (const row of rows) {
    const title = cleanTitle(row.name || row.titlos);
    const normalizedTitle = normalizeText(title);
    if (!title || !normalizedTitle) continue;

    const group =
      groups.get(normalizedTitle) ??
      {
        title,
        normalizedTitle,
        sourceUrl: sourceUrlForRow(row),
        composers: new Set<string>(),
        lyricists: new Set<string>(),
        singers: new Set<string>(),
        years: new Set<string>(),
        catalogNumbers: new Set<string>(),
        infoLines: [],
        recordings: 0,
      };

    const credits = parseSealabsCredits(row);
    credits.composers.forEach((name) => group.composers.add(name));
    credits.lyricists.forEach((name) => group.lyricists.add(name));
    splitNames(row.tragoudistis).forEach((name) => group.singers.add(name));
    const year = cleanName(row.etosixog).match(/\b(?:18|19|20)\d{2}\b/)?.[0];
    if (year) group.years.add(year);
    const catalog = cleanName(row.mitradiskos);
    if (catalog) group.catalogNumbers.add(catalog);

    const info = stripHtml(row.info);
    if (info && group.infoLines.length < 3) {
      group.infoLines.push(...info.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 2));
      group.infoLines = uniqueStrings(group.infoLines).slice(0, 3);
    }

    group.recordings += 1;
    groups.set(normalizedTitle, group);
  }

  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, "el"));
}

function findExistingSong(group: CandidateGroup, index: SongTitleIndex): SongIndexItem | null {
  const groupCoreTitle = titleCore(group.title);
  const groupWords = [
    ...new Set(`${group.normalizedTitle} ${groupCoreTitle}`.split(" ").filter((word) => word.length > 1)),
  ];
  const candidatesById = new Map<number, IndexedSong>();
  for (const word of groupWords) {
    for (const song of index.byWord.get(word) ?? []) {
      candidatesById.set(song.id, song);
    }
  }

  const candidates =
    candidatesById.size > 0
      ? [...candidatesById.values()]
      : groupWords.length <= 1
        ? index.singleWordSongs
        : [];

  let best: { song: SongIndexItem; score: number } | null = null;
  for (const song of candidates) {
    const score = titleScore(group.title, song.title);
    if (!best || score > best.score) best = { song, score };
    if (score >= 96) return song;
  }
  return best && best.score >= EXISTING_TITLE_SCORE ? best.song : null;
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const user = await getCurrentUserFromApi(_req);
  if (user?.role !== "ADMIN") {
    return json({ message: "Forbidden" }, 403);
  }

  const idNum = Number(ctx.params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return json({ message: "Μη έγκυρο ID καλλιτέχνη" }, 400);
  }

  const artist = await fetchJson<ArtistDetail>(`/artists/${idNum}`);
  const selectHtml = await fetchSealabsText("/select_song.php");
  const composerOptions = extractComposerOptions(selectHtml);
  const composerOption = findComposerOption(composerOptions, artist);

  if (!composerOption) {
    const aliases = artistAliases(artist);
    const suggestions = composerOptions
      .map((option) => ({
        ...option,
        score: Math.max(...aliases.map((alias) => titleScore(option.label, alias))),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return json(
      {
        message: "Δεν βρέθηκε αντίστοιχος συνθέτης στο Sealabs.",
        aliases,
        suggestions,
      },
      404,
    );
  }

  const [{ rows, total }, songs] = await Promise.all([
    fetchSealabsComposerRows(composerOption.value),
    fetchAllSongs(),
  ]);

  const groups = groupSealabsRows(rows);
  const songIndex = buildSongTitleIndex(songs);
  const candidates = [];
  let existingHidden = 0;

  for (const group of groups) {
    const existing = findExistingSong(group, songIndex);
    if (existing) {
      existingHidden += 1;
      continue;
    }

    candidates.push({
      title: group.title,
      sourceUrl: group.sourceUrl,
      composers: [...group.composers],
      lyricists: [...group.lyricists],
      singers: [...group.singers].slice(0, 8),
      years: [...group.years].sort(),
      catalogNumbers: [...group.catalogNumbers].slice(0, 4),
      infoLines: group.infoLines,
      recordings: group.recordings,
    });
  }

  return json({
    source: "rebetiko.sealabs.net",
    artist: {
      id: artist.id,
      title: artist.title,
      firstName: artist.firstName,
      lastName: artist.lastName,
    },
    sealabsComposer: composerOption,
    sealabsUrl: `${SEALABS_BASE_URL}/display.php?composer=${encodeURIComponent(composerOption.value)}`,
    totals: {
      sealabsRows: total || rows.length,
      sealabsUniqueTitles: groups.length,
      repertorioSongsChecked: songs.length,
      existingHidden,
      missingCandidates: candidates.length,
    },
    candidates,
  });
}
