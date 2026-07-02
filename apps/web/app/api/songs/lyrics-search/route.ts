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
  source: "stixoi.info" | "rebetiko.sealabs.net";
  sourceLabel: string;
  title: string;
  url: string;
  lyrics: string;
  confidence: number;
  preview: string;
  searchRank?: number;
};

const STIXOI_BASE_URL = "https://stixoi.info";
const SEALABS_BASE_URL = "https://rebetiko.sealabs.net";
const FETCH_TIMEOUT_MS = 9000;
const MAX_PAGES_TO_READ = 32;
const MAX_RESULTS = 10;
const MAX_SEALABS_ROWS_TO_READ = 10;
const MAX_SEALABS_LYRICS_TO_READ = 6;

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

function parseJsonStringLiteral(value: string): string | null {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return null;
  }
}

function scoreTitle(queryTitle: string, candidateTitle: string): number {
  const query = normalizeText(queryTitle);
  const candidate = normalizeText(candidateTitle);
  if (!query || !candidate) return 0;
  if (query === candidate) return 98;
  if (candidate.includes(query) || query.includes(candidate)) return 82;

  const queryTokens = new Set(query.split(" ").filter((x) => x.length > 1));
  const candidateTokens = new Set(candidate.split(" ").filter((x) => x.length > 1));
  if (!queryTokens.size || !candidateTokens.size) return 0;

  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }

  const precision = hits / candidateTokens.size;
  const recall = hits / queryTokens.size;
  return Math.round((precision * 0.35 + recall * 0.65) * 78);
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

type SealabsRow = {
  id?: string;
  name?: string;
  titlos?: string;
  pros8eta?: string;
  [key: string]: unknown;
};

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

async function searchStixoi(title: string, hint = ""): Promise<LyricsCandidate[]> {
  const encodedTitle = encodeURIComponent(title);
  const searchUrls = [
    `${STIXOI_BASE_URL}/search?q=${encodedTitle}`,
    `${STIXOI_BASE_URL}/songs?q=${encodedTitle}`,
  ];
  const links: string[] = [];
  const seenLinks = new Set<string>();

  for (const searchUrl of searchUrls) {
    const searchHtml = await fetchText(searchUrl);
    for (const link of extractStixoiSongLinks(searchHtml)) {
      if (seenLinks.has(link)) continue;
      seenLinks.add(link);
      links.push(link);
      if (links.length >= MAX_PAGES_TO_READ) break;
    }

    if (links.length >= MAX_PAGES_TO_READ) break;
  }

  const candidates: LyricsCandidate[] = [];

  for (const [searchRank, url] of links.entries()) {
    try {
      const pageHtml = await fetchText(url);
      const candidateTitle = extractStixoiTitle(pageHtml);
      const lyrics = extractStixoiLyrics(pageHtml);
      if (!candidateTitle || lyrics.length < 20) continue;

      const confidence = Math.min(100, scoreTitle(title, candidateTitle) + scoreLyricsHint(hint, lyrics));
      if (confidence < 35) continue;

      candidates.push({
        source: "stixoi.info",
        sourceLabel: "stixoi.info",
        title: candidateTitle,
        url,
        lyrics,
        confidence,
        preview: lyrics.split(/\n+/).slice(0, 3).join("\n"),
        searchRank,
      });
    } catch {
      // Keep searching the rest of the candidates.
    }
  }

  return candidates
    .sort((a, b) => b.confidence - a.confidence || (a.searchRank ?? 9999) - (b.searchRank ?? 9999))
    .slice(0, MAX_RESULTS);
}

async function searchSealabs(title: string, hint = ""): Promise<LyricsCandidate[]> {
  const rows = await fetchSealabsRows(title);
  const candidates: LyricsCandidate[] = [];
  let lyricsReads = 0;

  for (const [index, row] of rows.entries()) {
    if (lyricsReads >= MAX_SEALABS_LYRICS_TO_READ) break;

    const candidateTitle = cleanSearchTitle(String(row.name || row.titlos || ""));
    const lyricsId = extractSealabsLyricsId(row);
    if (!candidateTitle || !lyricsId) continue;

    const titleScore = scoreTitle(title, candidateTitle);
    if (titleScore < 35) continue;

    try {
      lyricsReads += 1;
      const lyrics = await fetchSealabsLyrics(lyricsId);
      if (lyrics.length < 20) continue;

      candidates.push({
        source: "rebetiko.sealabs.net",
        sourceLabel: "rebetiko.sealabs.net",
        title: candidateTitle,
        url: `${SEALABS_BASE_URL}/display.php?recid=${encodeURIComponent(String(row.id || ""))}`,
        lyrics,
        confidence: Math.min(100, titleScore + scoreLyricsHint(hint, lyrics)),
        preview: lyrics.split(/\n+/).slice(0, 3).join("\n"),
        searchRank: 1000 + index,
      });
    } catch {
      // Keep searching even if a Sealabs lyrics page is missing or slow.
    }
  }

  return candidates
    .sort((a, b) => b.confidence - a.confidence || (a.searchRank ?? 9999) - (b.searchRank ?? 9999))
    .slice(0, MAX_RESULTS);
}

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") || "").trim();
  const hint = (req.nextUrl.searchParams.get("hint") || "").trim().slice(0, 600);

  if (title.length < 2) {
    return json({ message: "Δώσε πρώτα τίτλο τραγουδιού." }, 400);
  }

  const settled = await Promise.allSettled([searchStixoi(title, hint), searchSealabs(title, hint)]);
  const items = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
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
    ],
  });
}
