import { Buffer } from "node:buffer";
import * as https from "node:https";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

type LyricsCandidate = {
  source: "stixoi.info" | "rebetiko.sealabs.net" | "greeklyrics.gr";
  sourceLabel: string;
  title: string;
  url: string;
  lyrics: string;
  confidence: number;
  preview: string;
  searchRank?: number;
  composerNames?: string[];
  lyricistNames?: string[];
  singerNames?: string[];
  year?: string | null;
  metadata?: LyricsCandidateMetadata;
};

type LyricsCandidateMetadata = {
  composerNames?: string[];
  lyricistNames?: string[];
  singerNames?: string[];
  year?: string | null;
  infoLines?: string[];
};

type LyricsSearchContext = {
  composerNames: string[];
  lyricistNames: string[];
  singerNames: string[];
};

type SourceSearchTerm = {
  term: string;
  field: "title" | "lyrics";
};

type CandidateScore = {
  confidence: number;
  titleScore: number;
  hintScore: number;
  contextScore: number;
};

const STIXOI_BASE_URL = "https://stixoi.info";
const SEALABS_BASE_URL = "https://rebetiko.sealabs.net";
const GREEKLYRICS_BASE_URL = "https://www.greeklyrics.gr";
const FETCH_TIMEOUT_MS = 6000;
const SOURCE_TIMEOUT_MS = 5200;
const SLOW_SOURCE_TIMEOUT_MS = 3200;
const MAX_PAGES_TO_READ = 10;
const MAX_RESULTS = 10;
const MAX_SEALABS_ROWS_TO_READ = 10;
const MAX_SEALABS_LYRICS_TO_READ = 6;
const MAX_GREEKLYRICS_SEARCHES = 3;
const MAX_GREEKLYRICS_PAGES_TO_READ = 5;
const SOURCE_FETCH_CONCURRENCY = 4;
const EMPTY_SEARCH_CONTEXT: LyricsSearchContext = {
  composerNames: [],
  lyricistNames: [],
  singerNames: [],
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
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

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripLyricsHtml(value: string): string {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<p>\s*<br\s*\/?>/gi, "<p>\n\n")
      .replace(/\n\s*<\/p>/gi, "</p>")
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeLyricsText(value: string): string {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSearchTitle(value: string): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCreditName(value: unknown): string {
  return stripHtml(String(value ?? ""))
    .replace(/\([^)]*(?:άγνωστο|unknown)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\-–—:•·]+|[\-–—:•·]+$/g, "")
    .trim();
}

function uniqNames(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const name = cleanCreditName(value);
    if (!name) continue;
    const key = normalizeText(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function splitCreditNames(value: unknown): string[] {
  const text = cleanCreditName(value);
  if (!text) return [];
  return uniqNames(
    text
      .replace(/\s+(?:και|&)\s+/gi, ",")
      .split(/[,;/|]+/g)
      .map((item) => item.trim()),
  );
}

function compactMetadata(metadata: LyricsCandidateMetadata): LyricsCandidateMetadata | undefined {
  const out: LyricsCandidateMetadata = {};
  const composerNames = uniqNames(metadata.composerNames ?? []);
  const lyricistNames = uniqNames(metadata.lyricistNames ?? []);
  const singerNames = uniqNames(metadata.singerNames ?? []);
  const infoLines = uniqNames(metadata.infoLines ?? []);
  const year = String(metadata.year ?? "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] ?? null;

  if (composerNames.length) out.composerNames = composerNames;
  if (lyricistNames.length) out.lyricistNames = lyricistNames;
  if (singerNames.length) out.singerNames = singerNames;
  if (year) out.year = year;
  if (infoLines.length) out.infoLines = infoLines.slice(0, 4);

  return Object.keys(out).length ? out : undefined;
}

function candidateMetadataFields(metadata: LyricsCandidateMetadata | undefined) {
  return {
    metadata,
    composerNames: metadata?.composerNames,
    lyricistNames: metadata?.lyricistNames,
    singerNames: metadata?.singerNames,
    year: metadata?.year ?? null,
  };
}

function extractJsonLdNames(html: string, field: "composer" | "lyricist" | "byArtist"): string[] {
  const normalizedHtml = String(html || "")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");
  const match = normalizedHtml.match(new RegExp(`"${field}"\\s*:\\s*(\\[[\\s\\S]*?\\]|"[^"]+")`, "i"));
  if (!match?.[1]) return [];

  const raw = match[1];
  if (raw.startsWith('"')) return splitCreditNames(raw.replace(/^"|"$/g, ""));

  const names: string[] = [];
  const re = /"name"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  let item: RegExpExecArray | null;
  while ((item = re.exec(raw)) !== null) {
    const parsed = parseJsonStringLiteral(item[1]) ?? item[1];
    names.push(parsed);
  }
  return uniqNames(names);
}

function extractJsonLdYear(html: string): string | null {
  const normalizedHtml = String(html || "").replace(/\\"/g, '"');
  return normalizedHtml.match(/"datePublished"\s*:\s*"((?:18|19|20)\d{2})/i)?.[1] ?? null;
}

function extractNamesAfterLabel(text: string, labels: string[]): string[] {
  const safeLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?:^|\\n|\\s)(?:${safeLabels.join("|")})\\s*[:：]\\s*([^\\n]+)`, "iu");
  const match = text.match(re);
  if (!match?.[1]) return [];
  return splitCreditNames(match[1].replace(/\s{2,}.*$/, ""));
}

function extractYearAfterLabel(text: string, labels: string[]): string | null {
  const safeLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?:^|\\n|\\s)(?:${safeLabels.join("|")})\\s*[:：]\\s*([^\\n]+)`, "iu");
  const match = text.match(re);
  return match?.[1]?.match(/\b(?:18|19|20)\d{2}\b/)?.[0] ?? null;
}

const TITLE_STOPWORDS = new Set([
  "και",
  "ο",
  "η",
  "το",
  "οι",
  "τα",
  "στο",
  "στη",
  "στην",
  "στον",
  "στους",
  "στις",
  "του",
  "της",
  "των",
  "τον",
  "την",
  "ένα",
  "ενα",
]);

function normalizeTitleForMatch(value: string): string {
  return normalizeText(value)
    .replace(/κωνσταν/g, "κωσταν")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleTokens(value: string): string[] {
  return normalizeTitleForMatch(value)
    .split(" ")
    .filter((token) => token.length > 1 && !TITLE_STOPWORDS.has(token));
}

function parseJsonStringLiteral(value: string): string | null {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return null;
  }
}

function scoreTitle(queryTitle: string, candidateTitle: string): number {
  const query = normalizeTitleForMatch(queryTitle);
  const candidate = normalizeTitleForMatch(candidateTitle);
  if (!query || !candidate) return 0;
  if (query === candidate) return 98;
  if (candidate.includes(query)) return 94;

  const queryTokens = new Set(getTitleTokens(query));
  const candidateTokens = new Set(getTitleTokens(candidate));
  if (!queryTokens.size || !candidateTokens.size) return 0;

  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }

  if (hits === queryTokens.size) {
    const specificity = Math.min(1, candidateTokens.size / queryTokens.size);
    return Math.round(82 + specificity * 12);
  }

  const precision = hits / candidateTokens.size;
  const recall = hits / queryTokens.size;
  const specificity = Math.min(1, candidateTokens.size / queryTokens.size);
  return Math.round((precision * 0.25 + recall * 0.65 + specificity * 0.1) * 78);
}

function scoreLyricsHint(hint: string, lyrics: string): number {
  const normalizedHint = normalizeText(hint);
  const normalizedLyrics = normalizeText(lyrics);
  if (!normalizedHint || !normalizedLyrics) return 0;
  if (normalizedLyrics.includes(normalizedHint)) return 18;

  const hintTokens = normalizedHint
    .split(" ")
    .filter((token) => token.length > 3)
    .slice(0, 14);
  if (!hintTokens.length) return 0;

  let hits = 0;
  for (const token of hintTokens) {
    if (normalizedLyrics.includes(token)) hits += 1;
  }

  const ratio = hits / hintTokens.length;
  const requiredHits = Math.max(3, Math.ceil(hintTokens.length * 0.65));
  if (hits < requiredHits) return 0;

  return Math.round(ratio * 10);
}

function normalizedNameTokens(value: string): string[] {
  return normalizeText(value)
    .replace(/ς/g, "σ")
    .split(" ")
    .filter((token) => token.length > 1);
}

function normalizedNameKey(value: string): string {
  return normalizedNameTokens(value).sort().join(" ");
}

function namesMatch(expected: string, candidate: string): boolean {
  const expectedText = normalizeText(expected).replace(/ς/g, "σ");
  const candidateText = normalizeText(candidate).replace(/ς/g, "σ");
  if (!expectedText || !candidateText) return false;
  if (expectedText === candidateText) return true;
  if (normalizedNameKey(expected) === normalizedNameKey(candidate)) return true;

  const expectedTokens = normalizedNameTokens(expected);
  const candidateTokens = normalizedNameTokens(candidate);
  if (!expectedTokens.length || !candidateTokens.length) return false;
  return expectedTokens.every((token) => candidateTokens.includes(token));
}

function scoreNameMatches(expected: string[], actual: string[] | undefined, maxScore: number): number {
  if (!expected.length || !actual?.length) return 0;
  for (const expectedName of expected) {
    if (actual.some((actualName) => namesMatch(expectedName, actualName))) {
      return maxScore;
    }
  }
  return 0;
}

function scoreCandidateContext(context: LyricsSearchContext, metadata: LyricsCandidateMetadata | undefined): number {
  if (!metadata) return 0;
  return Math.min(
    20,
    scoreNameMatches(context.composerNames, metadata.composerNames, 12) +
      scoreNameMatches(context.lyricistNames, metadata.lyricistNames, 10) +
      scoreNameMatches(context.singerNames, metadata.singerNames, 6),
  );
}

function scoreCandidate(
  title: string,
  candidateTitle: string,
  hint: string,
  lyrics: string,
  metadata: LyricsCandidateMetadata | undefined,
  context: LyricsSearchContext,
): CandidateScore {
  const titleScore = scoreTitle(title, candidateTitle);
  const hintScore = scoreLyricsHint(hint, lyrics);
  const contextScore = scoreCandidateContext(context, metadata);
  const titleConfidence = titleScore + contextScore;
  if (hasUsableLyricsHint(hint) && hintScore <= 0) {
    return {
      confidence: Math.min(72, titleConfidence),
      titleScore,
      hintScore,
      contextScore,
    };
  }
  const hintConfidence = hintScore > 0 ? Math.max(titleScore, 58) + hintScore + contextScore : 0;
  const confidence = Math.min(100, Math.max(titleConfidence, hintConfidence));
  return { confidence, titleScore, hintScore, contextScore };
}

function shouldKeepCandidate(score: CandidateScore, hint: string): boolean {
  if (score.titleScore >= 35) return true;
  return hasUsableLyricsHint(hint) && score.hintScore > 0;
}

function hasUsableLyricsHint(hint: string): boolean {
  return normalizeText(hint)
    .split(" ")
    .filter((token) => token.length > 3).length >= 3;
}

function lyricsMatchHint(hint: string, lyrics: string): boolean {
  if (!hasUsableLyricsHint(hint)) return false;
  return scoreLyricsHint(hint, lyrics) > 0;
}

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; RepertorioLyricsFinder/1.0; +https://repertorio.net)",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
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
    "User-Agent": "Mozilla/5.0 (compatible; RepertorioLyricsFinder/1.0; +https://repertorio.net)",
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

function fetchGreekLyricsText(
  pathOrUrl: string,
  options: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string> } = {},
  redirects = 0,
): Promise<string> {
  const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(pathOrUrl, GREEKLYRICS_BASE_URL);
  if (url.hostname !== "www.greeklyrics.gr" && url.hostname !== "greeklyrics.gr") {
    return Promise.reject(new Error("Unexpected GreekLyrics host"));
  }

  const method = options.method ?? "GET";
  const headers: Record<string, string | number> = {
    Accept: "text/html,application/xhtml+xml",
    "User-Agent": "Mozilla/5.0 (compatible; RepertorioLyricsFinder/1.0; +https://repertorio.net)",
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
          resolve(fetchGreekLyricsText(nextUrl, { ...options, method: status === 303 ? "GET" : method }, redirects + 1));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            reject(new Error(`GreekLyrics HTTP ${status}`));
            return;
          }
          resolve(text);
        });
      },
    );

    req.on("timeout", () => req.destroy(new Error("GreekLyrics request timed out")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function addStixoiPath(out: string[], seen: Set<string>, value: string | undefined) {
  if (!value) return;
  const path = value.startsWith("/songs/") ? value : `/songs/${value}`;
  if (!/^\/songs\/\d+$/.test(path) || seen.has(path)) return;
  seen.add(path);
  out.push(`${STIXOI_BASE_URL}${path}`);
}

function extractStixoiSongLinks(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const normalizedHtml = String(html || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');

  const patterns = [
    /href=["'](\/songs\/\d+)["']/g,
    /"href"\s*,\s*"(\/songs\/\d+)"/g,
    /\/songs\/(\d+)\b/g,
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalizedHtml)) !== null) {
      addStixoiPath(out, seen, match[1]);
      if (out.length >= MAX_PAGES_TO_READ) break;
    }

    if (out.length >= MAX_PAGES_TO_READ) break;
  }

  return out;
}

function extractStixoiTitle(html: string): string {
  const metaTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (metaTitle) {
    return decodeHtmlEntities(metaTitle).replace(/\s*(?:·|Β·)\s*stixoi\.info\s*$/i, "").trim();
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) {
    return stripHtml(title).replace(/\s*(?:·|Β·)\s*stixoi\.info\s*$/i, "").trim();
  }

  return "";
}

function extractStixoiLyrics(html: string): string {
  const rscLyrics =
    html.match(/\\"lyrics\\":\\"((?:\\\\.|[^"\\])*)\\"/)?.[1] ||
    html.match(/"lyrics":"((?:\\.|[^"\\])*)"/)?.[1];

  const parsed = rscLyrics ? parseJsonStringLiteral(rscLyrics) : null;
  if (parsed) {
    const normalized = normalizeLyricsText(parsed);
    if (normalized.length > 20) return normalized;
  }

  const lyricsSection = html.match(/<section[^>]+id=["']lyrics["'][^>]*>([\s\S]*?)<\/section>/i)?.[1];
  if (lyricsSection) {
    const stripped = normalizeLyricsText(stripHtml(lyricsSection).replace(/^Στίχοι\s*/i, ""));
    if (stripped.length > 20) return stripped;
  }

  return "";
}

function extractStixoiMetadata(html: string): LyricsCandidateMetadata | undefined {
  return compactMetadata({
    composerNames: extractJsonLdNames(html, "composer"),
    lyricistNames: extractJsonLdNames(html, "lyricist"),
    singerNames: extractJsonLdNames(html, "byArtist"),
    year: extractJsonLdYear(html),
  });
}

function getInputValue(html: string, id: string): string {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const input = html.match(new RegExp(`<input[^>]+id=["']${escapedId}["'][^>]*>`, "i"))?.[0] || "";
  const value = input.match(/\bvalue=["']([^"']*)["']/i)?.[1] || "";
  return decodeHtmlEntities(value);
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function splitParamNames(values: unknown[]): string[] {
  return uniqNames(
    values.flatMap((value) =>
      String(value ?? "")
        .split(/[,|]/g)
        .map((item) => item.trim()),
    ),
  );
}

function parseSearchContext(req: NextRequest): LyricsSearchContext {
  const params = req.nextUrl.searchParams;
  return {
    composerNames: splitParamNames([...params.getAll("composer"), ...params.getAll("composerName")]),
    lyricistNames: splitParamNames([...params.getAll("lyricist"), ...params.getAll("lyricistName")]),
    singerNames: splitParamNames([...params.getAll("singer"), ...params.getAll("singerName")]),
  };
}

function buildHintSearchTerms(hint: string): string[] {
  if (!hasUsableLyricsHint(hint)) return [];

  const lines = normalizeLyricsText(hint)
    .split("\n")
    .map((line) => cleanSearchTitle(line))
    .filter((line) => normalizeText(line).split(" ").filter((token) => token.length > 3).length >= 3);

  const terms: string[] = [];
  if (lines[0]) terms.push(lines[0].slice(0, 110));

  const tokenPhrase = normalizeText(lines.join(" "))
    .split(" ")
    .filter((token) => token.length > 3)
    .slice(0, 7)
    .join(" ");
  if (tokenPhrase) terms.push(tokenPhrase);

  return uniqueValues(terms).slice(0, 2);
}

function buildSourceSearchTerms(title: string, hint: string): SourceSearchTerm[] {
  return [
    { term: title, field: "title" as const },
    ...buildHintSearchTerms(hint).map((term) => ({ term, field: "lyrics" as const })),
  ].slice(0, 3);
}

function buildGreekLyricsSearchTerms(title: string): string[] {
  const titleWithCommonSpelling = title.replace(/Κωσταν/g, "Κωνσταν").replace(/κωσταν/g, "κωνσταν");
  const tokenTitle = getTitleTokens(title).join(" ");
  const tokenTitleWithCommonSpelling = tokenTitle.replace(/κωσταν/g, "κωνσταν");
  return uniqueValues([title, titleWithCommonSpelling, tokenTitleWithCommonSpelling || tokenTitle]).slice(
    0,
    MAX_GREEKLYRICS_SEARCHES,
  );
}

function buildGreekLyricsSearchBody(
  searchPageHtml: string,
  title: string,
  field: SourceSearchTerm["field"] = "title",
): string {
  const params = new URLSearchParams();
  params.set("__VIEWSTATE", getInputValue(searchPageHtml, "__VIEWSTATE"));
  params.set("__VIEWSTATEGENERATOR", getInputValue(searchPageHtml, "__VIEWSTATEGENERATOR"));
  params.set("__EVENTVALIDATION", getInputValue(searchPageHtml, "__EVENTVALIDATION"));
  params.set("__EVENTTARGET", "ctl00$ContentPlaceHolder1$apotelsynthetianazito");
  params.set("__EVENTARGUMENT", "");
  params.set("ctl00$ContentPlaceHolder1$ONOMATRAGOYDIOY", field === "title" ? title : "");
  params.set("ctl00$ContentPlaceHolder1$ONOMAKALLITEXNI", "");
  params.set("ctl00$ContentPlaceHolder1$ONOMASTIXOS", field === "lyrics" ? title : "");
  return params.toString();
}

function addGreekLyricsPath(out: string[], seen: Set<string>, value: string | undefined) {
  if (!value) return;
  const path = value.startsWith("/") ? value : `/${value}`;
  if (!/^\/stixoi-[^"'#?]+$/i.test(path) || seen.has(path)) return;
  seen.add(path);
  out.push(`${GREEKLYRICS_BASE_URL}${path}`);
}

function extractGreekLyricsSongLinks(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href=["']([^"']*stixoi-[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(html || ""))) !== null) {
    addGreekLyricsPath(out, seen, match[1]);
    if (out.length >= MAX_GREEKLYRICS_PAGES_TO_READ) break;
  }
  return out;
}

async function fetchGreekLyricsSearchLinks(
  title: string,
  field: SourceSearchTerm["field"] = "title",
): Promise<string[]> {
  const links: string[] = [];
  const seen = new Set<string>();
  const searchPageHtml = await fetchGreekLyricsText("/search-results");

  const searchTerms = field === "title" ? buildGreekLyricsSearchTerms(title) : uniqueValues([title]);
  for (const searchTerm of searchTerms) {
    const body = buildGreekLyricsSearchBody(searchPageHtml, searchTerm, field);
    const resultHtml = await fetchGreekLyricsText("/search-results", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
    });

    for (const link of extractGreekLyricsSongLinks(resultHtml)) {
      if (seen.has(link)) continue;
      seen.add(link);
      links.push(link);
      if (links.length >= MAX_GREEKLYRICS_PAGES_TO_READ) break;
    }

    if (links.length >= MAX_GREEKLYRICS_PAGES_TO_READ) break;
  }

  return links;
}

function extractGreekLyricsTitle(html: string): string {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (heading) return stripHtml(heading);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) return stripHtml(title).replace(/\s*-\s*Greek Lyrics\s*$/i, "").trim();

  return "";
}

function extractGreekLyricsLyrics(html: string): string {
  const block =
    html.match(/<div[^>]+class=["'][^"']*\btragoydistixoi\b[^"']*["'][^>]*>([\s\S]*?)<div[^>]+class=["'][^"']*\btragoydixaraktiristika\b/i)?.[1] ||
    "";
  if (!block) return "";

  const ratingIndex = block.lastIndexOf('divrating divratingpsifizo');
  let lyricsHtml = block;
  if (ratingIndex >= 0) {
    const afterRating = block.slice(ratingIndex);
    const ratingEnd = afterRating.indexOf("</div>");
    if (ratingEnd >= 0) lyricsHtml = afterRating.slice(ratingEnd + "</div>".length);
  }

  const stripped = normalizeLyricsText(stripLyricsHtml(lyricsHtml));
  return stripped.replace(/^Βαθμολογήστε το τραγούδι\s*/i, "").trim();
}

function extractGreekLyricsMetadata(html: string): LyricsCandidateMetadata | undefined {
  const marker = html.search(/class=["'][^"']*\btragoydixaraktiristika\b/i);
  if (marker < 0) return undefined;

  const block = html.slice(marker, marker + 12000);
  const text = normalizeLyricsText(stripHtml(block));
  if (!text) return undefined;

  return compactMetadata({
    composerNames: extractNamesAfterLabel(text, ["Μουσική", "Συνθέτης", "Συνθέτες"]),
    lyricistNames: extractNamesAfterLabel(text, ["Στίχοι", "Στιχουργός", "Στιχουργοί"]),
    singerNames: extractNamesAfterLabel(text, [
      "Τραγουδιστής",
      "Τραγουδιστές",
      "Ερμηνευτής",
      "Ερμηνευτές",
      "Πρώτη εκτέλεση",
    ]),
    year: extractYearAfterLabel(text, ["Έτος", "Χρονιά", "Ηχογράφηση", "Κυκλοφορία"]),
  });
}

type SealabsRow = {
  id?: string;
  name?: string;
  titlos?: string;
  mousiki?: string;
  stixoi?: string;
  stixourgos?: string;
  tragoudistis?: string;
  etosixog?: string;
  info?: string;
  pros8eta?: string;
  [key: string]: unknown;
};

function extractSealabsMetadata(row: SealabsRow): LyricsCandidateMetadata | undefined {
  const infoText = normalizeLyricsText(stripHtml(String(row.info ?? "")));
  return compactMetadata({
    composerNames: [
      ...splitCreditNames(row.mousiki),
      ...extractNamesAfterLabel(infoText, ["Μουσική", "Συνθέτης", "Συνθέτες"]),
    ],
    lyricistNames: [
      ...splitCreditNames(row.stixoi),
      ...splitCreditNames(row.stixourgos),
      ...extractNamesAfterLabel(infoText, ["Στίχοι", "Στιχουργός", "Στιχουργοί"]),
    ],
    singerNames: [
      ...splitCreditNames(row.tragoudistis),
      ...extractNamesAfterLabel(infoText, [
        "Τραγουδιστής",
        "Τραγουδιστές",
        "Ερμηνευτής",
        "Ερμηνευτές",
        "Πρώτη εκτέλεση",
      ]),
    ],
    year: String(row.etosixog ?? "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] ?? null,
    infoLines: infoText ? infoText.split("\n").slice(0, 3) : [],
  });
}

function buildSealabsSearchBody(title: string): string {
  const params = new URLSearchParams({
    draw: "1",
    start: "0",
    length: String(MAX_SEALABS_ROWS_TO_READ),
    "search[value]": "",
    "search[regex]": "false",
    id_xristi: "1",
    compos_query: "",
    searchstring: title,
    recid: "",
    date_span: "",
    composer: "",
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

function extractSealabsLyricsId(row: SealabsRow): string {
  const actions = String(row.pros8eta || "");
  const match =
    actions.match(/\bid=["']\d+__([^"']+)["'][^>]*\bclass=["'][^"']*\bstixoibutton\b/i) ||
    actions.match(/\bclass=["'][^"']*\bstixoibutton\b[^>]*\bid=["']\d+__([^"']+)["']/i);
  return match?.[1] || "";
}

async function fetchSealabsRows(title: string): Promise<SealabsRow[]> {
  const text = await fetchSealabsText("/server_processing.php", {
    method: "POST",
    body: buildSealabsSearchBody(title),
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const parsed = JSON.parse(text) as { data?: SealabsRow[] };
  return Array.isArray(parsed.data) ? parsed.data : [];
}

async function fetchSealabsLyrics(lyricsId: string): Promise<string> {
  const html = await fetchSealabsText(`/makis2.php?id=${lyricsId}`);
  return normalizeLyricsText(stripLyricsHtml(html));
}

function dedupeCandidates(candidates: LyricsCandidate[]): LyricsCandidate[] {
  const byLyrics = new Map<string, LyricsCandidate>();

  for (const candidate of candidates) {
    const lyricsKey = normalizeText(candidate.lyrics).split(" ").slice(0, 90).join(" ");
    const key = lyricsKey || `${candidate.source}:${candidate.url}`;
    const existing = byLyrics.get(key);
    if (
      !existing ||
      candidate.confidence > existing.confidence ||
      (candidate.confidence === existing.confidence &&
        (candidate.searchRank ?? 9999) < (existing.searchRank ?? 9999))
    ) {
      byLyrics.set(key, candidate);
    }
  }

  return Array.from(byLyrics.values());
}

async function searchStixoi(
  title: string,
  hint = "",
  context = EMPTY_SEARCH_CONTEXT,
  searchTerms: SourceSearchTerm[] = [{ term: title, field: "title" }],
): Promise<LyricsCandidate[]> {
  const links: Array<{ url: string; searchRank: number }> = [];
  const seenLinks = new Set<string>();
  const perTermLimit = Math.max(3, Math.ceil(MAX_PAGES_TO_READ / Math.max(1, searchTerms.length)));

  for (const [termIndex, sourceTerm] of searchTerms.entries()) {
    const encodedTerm = encodeURIComponent(sourceTerm.term);
    const searchUrls = [
      `${STIXOI_BASE_URL}/search?q=${encodedTerm}`,
      `${STIXOI_BASE_URL}/songs?q=${encodedTerm}`,
    ];
    let termLinks = 0;

    for (const searchUrl of searchUrls) {
      const searchHtml = await fetchText(searchUrl);
      for (const link of extractStixoiSongLinks(searchHtml)) {
        if (seenLinks.has(link)) continue;
        seenLinks.add(link);
        links.push({ url: link, searchRank: termIndex * 100 + termLinks });
        termLinks += 1;
        if (links.length >= MAX_PAGES_TO_READ || termLinks >= perTermLimit) break;
      }

      if (links.length >= MAX_PAGES_TO_READ || termLinks >= perTermLimit) break;
    }

    if (links.length >= MAX_PAGES_TO_READ) break;
  }

  const candidates = await mapWithConcurrency(
    links,
    SOURCE_FETCH_CONCURRENCY,
    async (link): Promise<LyricsCandidate | null> => {
      try {
        const { url, searchRank } = link;
        const pageHtml = await fetchText(url);
        const candidateTitle = extractStixoiTitle(pageHtml);
        const lyrics = extractStixoiLyrics(pageHtml);
        if (!candidateTitle || lyrics.length < 20) return null;

        const metadata = extractStixoiMetadata(pageHtml);
        const score = scoreCandidate(title, candidateTitle, hint, lyrics, metadata, context);
        if (!shouldKeepCandidate(score, hint)) return null;

        return {
          source: "stixoi.info",
          sourceLabel: "stixoi.info",
          title: candidateTitle,
          url,
          lyrics,
          confidence: score.confidence,
          preview: lyrics.split(/\n+/).slice(0, 3).join("\n"),
          searchRank,
          ...candidateMetadataFields(metadata),
        };
      } catch {
        // Keep searching the rest of the candidates.
        return null;
      }
    },
  );

  return dedupeCandidates(candidates.filter((candidate): candidate is LyricsCandidate => Boolean(candidate)))
    .sort((a, b) => b.confidence - a.confidence || (a.searchRank ?? 9999) - (b.searchRank ?? 9999))
    .slice(0, MAX_RESULTS);
}

async function searchSealabs(
  title: string,
  hint = "",
  context = EMPTY_SEARCH_CONTEXT,
  searchTerms: SourceSearchTerm[] = [{ term: title, field: "title" }],
): Promise<LyricsCandidate[]> {
  const candidates: LyricsCandidate[] = [];
  let lyricsReads = 0;
  let rowOffset = 0;

  for (const sourceTerm of searchTerms) {
    if (lyricsReads >= MAX_SEALABS_LYRICS_TO_READ) break;
    const rows = await fetchSealabsRows(sourceTerm.term);

    for (const [index, row] of rows.entries()) {
      if (lyricsReads >= MAX_SEALABS_LYRICS_TO_READ) break;

      const candidateTitle = cleanSearchTitle(String(row.name || row.titlos || ""));
      const lyricsId = extractSealabsLyricsId(row);
      if (!candidateTitle || !lyricsId) continue;

      const metadata = extractSealabsMetadata(row);
      const titleScore = scoreTitle(title, candidateTitle);
      if (titleScore < 35 && !hasUsableLyricsHint(hint)) continue;

      try {
        lyricsReads += 1;
        const lyrics = await fetchSealabsLyrics(lyricsId);
        if (lyrics.length < 20) continue;
        const score = scoreCandidate(title, candidateTitle, hint, lyrics, metadata, context);
        if (!shouldKeepCandidate(score, hint)) continue;

        candidates.push({
          source: "rebetiko.sealabs.net",
          sourceLabel: "rebetiko.sealabs.net",
          title: candidateTitle,
          url: `${SEALABS_BASE_URL}/display.php?recid=${encodeURIComponent(String(row.id || ""))}`,
          lyrics,
          confidence: score.confidence,
          preview: lyrics.split(/\n+/).slice(0, 3).join("\n"),
          searchRank: 1000 + rowOffset + index,
          ...candidateMetadataFields(metadata),
        });
      } catch {
        // Keep searching even if a Sealabs lyrics page is missing or slow.
      }
    }

    rowOffset += rows.length;
  }

  return dedupeCandidates(candidates)
    .sort((a, b) => b.confidence - a.confidence || (a.searchRank ?? 9999) - (b.searchRank ?? 9999))
    .slice(0, MAX_RESULTS);
}

async function searchGreekLyrics(
  title: string,
  hint = "",
  context = EMPTY_SEARCH_CONTEXT,
  searchTerms: SourceSearchTerm[] = [{ term: title, field: "title" }],
): Promise<LyricsCandidate[]> {
  const links: Array<{ url: string; searchRank: number }> = [];
  const seenLinks = new Set<string>();
  const perTermLimit = Math.max(1, Math.ceil(MAX_GREEKLYRICS_PAGES_TO_READ / Math.max(1, searchTerms.length)));
  for (const [termIndex, sourceTerm] of searchTerms.entries()) {
    const foundLinks = await fetchGreekLyricsSearchLinks(sourceTerm.term, sourceTerm.field);
    let termLinks = 0;
    for (const [index, link] of foundLinks.entries()) {
      if (seenLinks.has(link)) continue;
      seenLinks.add(link);
      links.push({ url: link, searchRank: termIndex * 100 + index });
      termLinks += 1;
      if (links.length >= MAX_GREEKLYRICS_PAGES_TO_READ || termLinks >= perTermLimit) break;
    }
    if (links.length >= MAX_GREEKLYRICS_PAGES_TO_READ) break;
  }

  const candidates: LyricsCandidate[] = [];

  for (const { url, searchRank } of links) {
    try {
      const pageHtml = await fetchGreekLyricsText(url);
      const candidateTitle = extractGreekLyricsTitle(pageHtml);
      if (!candidateTitle) continue;

      const lyrics = extractGreekLyricsLyrics(pageHtml);
      if (lyrics.length < 20) continue;
      const metadata = extractGreekLyricsMetadata(pageHtml);
      const score = scoreCandidate(title, candidateTitle, hint, lyrics, metadata, context);
      if (!shouldKeepCandidate(score, hint)) continue;

      candidates.push({
        source: "greeklyrics.gr",
        sourceLabel: "greeklyrics.gr",
        title: candidateTitle,
        url,
        lyrics,
        confidence: score.confidence,
        preview: lyrics.split(/\n+/).slice(0, 3).join("\n"),
        searchRank: 2000 + searchRank,
        ...candidateMetadataFields(metadata),
      });
    } catch {
      // GreekLyrics is an extra source; keep the existing search healthy if one page fails.
    }
  }

  return dedupeCandidates(candidates)
    .sort((a, b) => b.confidence - a.confidence || (a.searchRank ?? 9999) - (b.searchRank ?? 9999))
    .slice(0, MAX_RESULTS);
}

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") || "").trim();
  const hint = (req.nextUrl.searchParams.get("hint") || "").trim().slice(0, 600);
  const context = parseSearchContext(req);
  const searchTerms = buildSourceSearchTerms(title, hint);
  const requireHintMatch =
    req.nextUrl.searchParams.get("requireHintMatch") === "1" ||
    req.nextUrl.searchParams.get("strictLyrics") === "1";

  if (title.length < 2) {
    return json({ message: "Δώσε πρώτα τίτλο τραγουδιού." }, 400);
  }

  if (requireHintMatch && !hasUsableLyricsHint(hint)) {
    return json(
      { message: "Πρόσθεσε πρώτα λίγους στίχους ώστε η αναζήτηση info να ταιριάξει το σωστό τραγούδι." },
      400,
    );
  }

  const sourceResults = await Promise.all([
    withTimeout(searchStixoi(title, hint, context, searchTerms), [], SOURCE_TIMEOUT_MS),
    withTimeout(searchSealabs(title, hint, context, searchTerms), [], SLOW_SOURCE_TIMEOUT_MS),
    withTimeout(searchGreekLyrics(title, hint, context, searchTerms), [], SLOW_SOURCE_TIMEOUT_MS),
  ]);
  const items = dedupeCandidates(sourceResults.flatMap((result) => result))
    .filter((candidate) => !requireHintMatch || lyricsMatchHint(hint, candidate.lyrics))
    .sort((a, b) => b.confidence - a.confidence || (a.searchRank ?? 9999) - (b.searchRank ?? 9999))
    .slice(0, MAX_RESULTS);

  return json({
    items,
    searchedSources: [
      {
        id: "stixoi.info",
        label: "stixoi.info",
        url: `${STIXOI_BASE_URL}/search?q=${encodeURIComponent(title)}`,
      },
      {
        id: "rebetiko.sealabs.net",
        label: "rebetiko.sealabs.net",
        url: `${SEALABS_BASE_URL}/display.php?string=${encodeURIComponent(title)}`,
      },
      {
        id: "greeklyrics.gr",
        label: "greeklyrics.gr",
        url: `${GREEKLYRICS_BASE_URL}/search-results`,
      },
    ],
  });
}
