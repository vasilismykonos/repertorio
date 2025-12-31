// apps/web/app/api/songs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

type ApiSongResponse = {
  id: number;
  title: string;
};

type CreditsJson = {
  composerArtistIds?: unknown;
  lyricistArtistIds?: unknown;
};

type PatchSongBody = {
  title?: string;
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

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = Number(ctx.params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return new NextResponse(buildRedirectHtml("/songs"), {
      status: 302,
      headers: { "content-type": "text/html" },
    });
  }

  const formData = await req.formData();

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

  // ✅ creditsJson: IDS
  const parsedCredits = parseJsonSafe<CreditsJson>(formData.get("creditsJson"), {});
  const composerArtistIds = normalizeIds(parsedCredits?.composerArtistIds);
  const lyricistArtistIds = normalizeIds(parsedCredits?.lyricistArtistIds);

  const body: PatchSongBody = {
    title: title || undefined,
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
  };

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  let ok = true;

  // 1) PATCH song
  const upstreamSongUrl = `${API_BASE_URL}/songs/${idNum}`;
  try {
    const res = await fetch(upstreamSongUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      ok = false;
      const text = await res.text().catch(() => "");
      console.error("Update song failed", {
        id: idNum,
        upstreamSongUrl,
        status: res.status,
        statusText: res.statusText,
        responseText: text,
      });
    } else {
      await res.json().catch(() => null as ApiSongResponse | null);
    }
  } catch (err) {
    ok = false;
    console.error("Update song threw error", { id: idNum, upstreamSongUrl, err });
  }

  // 2) PUT credits
  const upstreamCreditsUrl = `${API_BASE_URL}/songs/${idNum}/credits`;
  try {
    const res = await fetch(upstreamCreditsUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ composerArtistIds, lyricistArtistIds }),
    });

    if (!res.ok) {
      ok = false;
      const text = await res.text().catch(() => "");
      console.error("Update credits failed", {
        id: idNum,
        upstreamCreditsUrl,
        status: res.status,
        statusText: res.statusText,
        sent: { composerArtistIds, lyricistArtistIds },
        responseText: text,
      });
    } else {
      await res.json().catch(() => null);
    }
  } catch (err) {
    ok = false;
    console.error("Update credits threw error", { id: idNum, upstreamCreditsUrl, err });
  }

  const targetPath = ok ? `/songs/${idNum}` : `/songs/${idNum}?error=1`;
  return new NextResponse(buildRedirectHtml(targetPath), {
    status: 302,
    headers: { "content-type": "text/html" },
  });
}
