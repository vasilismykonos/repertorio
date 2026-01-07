// apps/web/app/api/songs/route.ts
import { NextRequest, NextResponse } from "next/server";

type CreditsJson = {
  composerArtistIds?: unknown;
  lyricistArtistIds?: unknown;
};

type CreateSongBody = {
  composerArtistIds?: number[];
  lyricistArtistIds?: number[];

  title: string;

  firstLyrics?: string | null;
  lyrics?: string | null;
  characteristics?: string | null;
  originalKey?: string | null;
  chords?: string | null;
  status?: string | null;

  categoryId?: number | null;
  rythmId?: number | null;
  makamId?: number | null;

  tagIds?: number[] | null;

  assets?: any[] | null;
  versions?: any[] | null;
};

const API_BASE_URL = (
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

function buildRedirectHtml(targetPath: string): string {
  const safePath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  return `<!DOCTYPE html>
<html lang="el">
  <head>
    <meta charset="utf-8" />
    <title>Μεταφορά...</title>
    <meta http-equiv="refresh" content="0; url=${safePath}" />
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <p>Μεταφορά...</p>
    <script>
      (function () {
        try { window.location.replace(${JSON.stringify(safePath)}); } catch (e) {}
      })();
    </script>
  </body>
</html>`;
}

function pickForwardHeader(req: NextRequest, name: string): string | undefined {
  const v = req.headers.get(name);
  return v && v.trim() ? v : undefined;
}

function parseJsonSafe<T>(input: FormDataEntryValue | null, fallback: T): T {
  try {
    if (typeof input !== "string") return fallback;
    const s = input.trim();
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function normalizeIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const x of input) {
    const n = Math.trunc(Number(x));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function normalizeArray(input: unknown): any[] {
  return Array.isArray(input) ? input : [];
}

function toStringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const s = v;
  return s.trim() === "" ? null : s;
}

function toNumberOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  // ίδια ονόματα fields με SongEditForm
  const title = toStringOrNull(formData.get("title"));
  const firstLyrics = toStringOrNull(formData.get("firstLyrics"));
  const lyrics = toStringOrNull(formData.get("lyrics"));
  const characteristics = toStringOrNull(formData.get("characteristics"));
  const originalKey = toStringOrNull(formData.get("originalKey"));
  const chords = toStringOrNull(formData.get("chords"));
  const status = toStringOrNull(formData.get("status"));

  const categoryId = toNumberOrNull(formData.get("categoryId"));
  const rythmId = toNumberOrNull(formData.get("rythmId"));
  const makamId = toNumberOrNull(formData.get("makamId"));

  const parsedTagIds = parseJsonSafe<unknown>(formData.get("tagIdsJson"), []);
  const tagIds = normalizeIds(parsedTagIds);

  const parsedAssets = parseJsonSafe<unknown>(formData.get("assetsJson"), []);
  const assets = normalizeArray(parsedAssets);

  const parsedVersions = parseJsonSafe<unknown>(formData.get("versionsJson"), []);
  const versions = normalizeArray(parsedVersions);

  // creditsJson: IDS
  const parsedCredits = parseJsonSafe<CreditsJson>(formData.get("creditsJson"), {});
  const composerArtistIds = normalizeIds(parsedCredits?.composerArtistIds);
  const lyricistArtistIds = normalizeIds(parsedCredits?.lyricistArtistIds);

  if (!title) {
    return new NextResponse(buildRedirectHtml("/songs/new?error=1"), {
      status: 302,
      headers: { "content-type": "text/html" },
    });
  }

  const body: CreateSongBody = {
    title,
    firstLyrics,
    lyrics,
    characteristics,
    originalKey,
    chords,
    status,
    categoryId,
    rythmId,
    makamId,
    tagIds,
    assets,
    versions,
    composerArtistIds,
    lyricistArtistIds,
  };

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  let ok = true;
  let newId: number | null = null;

  // 1) CREATE song (upstream)
  const upstreamCreateUrl = `${API_BASE_URL}/songs/full`;
  try {
    const res = await fetch(upstreamCreateUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      ok = false;
      const text = await res.text().catch(() => "");
      console.error("Create song failed", {
        upstreamCreateUrl,
        status: res.status,
        statusText: res.statusText,
        responseText: text,
      });
    } else {
      const created = (await res.json().catch(() => null)) as { id?: number } | null;
      const idCandidate = Number(created?.id);
      if (Number.isFinite(idCandidate) && idCandidate > 0) newId = idCandidate;
      else ok = false;
    }
  } catch (err) {
    ok = false;
    console.error("Create song threw error", { upstreamCreateUrl, err });
  }

  // αν δεν δημιουργήθηκε, γύρνα πίσω
  if (!ok || !newId) {
    return new NextResponse(buildRedirectHtml("/songs/new?error=1"), {
      status: 302,
      headers: { "content-type": "text/html" },
    });
  }

  // 2) ✅ Credits πλέον περιλαμβάνονται στο /songs/full payload (no extra request)

// redirect: αν credits fail, ακόμα έχεις τραγούδι, απλώς δείξε error
  const targetPath = ok ? `/songs/${newId}/edit` : `/songs/${newId}/edit?error=1`;
  return new NextResponse(buildRedirectHtml(targetPath), {
    status: 302,
    headers: { "content-type": "text/html" },
  });
}
