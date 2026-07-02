import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

type LyricsCandidate = {
  source: "stixoi.info";
  sourceLabel: string;
  title: string;
  url: string;
  lyrics: string;
  confidence: number;
  preview: string;
};

const STIXOI_BASE_URL = "https://stixoi.info";
const FETCH_TIMEOUT_MS = 9000;
const MAX_PAGES_TO_READ = 32;

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

async function searchStixoi(title: string): Promise<LyricsCandidate[]> {
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

  for (const url of links) {
    try {
      const pageHtml = await fetchText(url);
      const candidateTitle = extractStixoiTitle(pageHtml);
      const lyrics = extractStixoiLyrics(pageHtml);
      if (!candidateTitle || lyrics.length < 20) continue;

      const confidence = scoreTitle(title, candidateTitle);
      if (confidence < 35) continue;

      candidates.push({
        source: "stixoi.info",
        sourceLabel: "stixoi.info",
        title: candidateTitle,
        url,
        lyrics,
        confidence,
        preview: lyrics.split(/\n+/).slice(0, 3).join("\n"),
      });
    } catch {
      // Keep searching the rest of the candidates.
    }
  }

  return candidates
    .sort((a, b) => b.confidence - a.confidence || b.lyrics.length - a.lyrics.length)
    .slice(0, 5);
}

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") || "").trim();

  if (title.length < 2) {
    return json({ message: "Δώσε πρώτα τίτλο τραγουδιού." }, 400);
  }

  try {
    const items = await searchStixoi(title);
    return json({
      items,
      searchedSources: [
        {
          id: "stixoi.info",
          label: "stixoi.info",
          url: `${STIXOI_BASE_URL}/search?q=${encodeURIComponent(title)}`,
        },
      ],
    });
  } catch (err: any) {
    return json(
      {
        message:
          err?.name === "AbortError"
            ? "Η αναζήτηση άργησε πολύ. Δοκίμασε ξανά."
            : "Αποτυχία αναζήτησης στίχων.",
      },
      502,
    );
  }
}
