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
  composerArtistIds?: number[] | null;
  lyricistArtistIds?: number[] | null;

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

// ✅ Never static: depends on auth cookies / headers
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getApiBaseUrl(): string {
  const base = (
    process.env.API_INTERNAL_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "/api/v1"
  )
    .trim()
    .replace(/\/$/, "");

  if (!base) {
    // hard fail: misconfigured server
    throw new Error(
      "Missing API base URL. Set API_INTERNAL_BASE_URL (server) and/or NEXT_PUBLIC_API_BASE_URL (client).",
    );
  }
  return base;
}

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

function parseSongId(ctx: { params: { id: string } }): number | null {
  const idNum = Number(ctx?.params?.id);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  return Math.trunc(idNum);
}

async function readBodyAsJsonOrText(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await res.json().catch(() => null);
  }
  return await res.text().catch(() => "");
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = parseSongId(ctx);
  if (!idNum) {
    return NextResponse.json({ message: "Μη έγκυρο ID τραγουδιού" }, { status: 400 });
  }

  let API_BASE_URL: string;
  try {
    API_BASE_URL = getApiBaseUrl();
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || "Server misconfigured" }, { status: 500 });
  }

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  const { searchParams } = new URL(req.url);
  const noIncrement = searchParams.get("noIncrement");
  const qs = noIncrement ? `?noIncrement=${encodeURIComponent(noIncrement)}` : "";

  const upstreamUrl = `${API_BASE_URL}/songs/${idNum}${qs}`;

  try {
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const data = await readBodyAsJsonOrText(res);

    if (!res.ok) {
      return NextResponse.json(
        typeof data === "string" ? { message: data || `Αποτυχία ανάκτησης (${res.status})` } : data,
        { status: res.status },
      );
    }

    return NextResponse.json(
      typeof data === "string" ? { ok: true, text: data } : data,
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Σφάλμα επικοινωνίας με API" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = parseSongId(ctx);
  if (!idNum) {
    return new NextResponse(buildRedirectHtml("/songs"), {
      status: 302,
      headers: { "content-type": "text/html" },
    });
  }

  let API_BASE_URL: string;
  try {
    API_BASE_URL = getApiBaseUrl();
  } catch (e: any) {
    return new NextResponse(buildRedirectHtml(`/songs/${idNum}?error=1`), {
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
    composerArtistIds,
    lyricistArtistIds,
  };

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  let ok = true;

  // ✅ One canonical endpoint (no guessing): matches your PATCH /songs/:id/full convention
  const upstreamSongUrl = `${API_BASE_URL}/songs/${idNum}/full`;

  try {
    const res = await fetch(upstreamSongUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
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

  const targetPath = ok ? `/songs/${idNum}` : `/songs/${idNum}?error=1`;
  return new NextResponse(buildRedirectHtml(targetPath), {
    status: 302,
    headers: { "content-type": "text/html" },
  });
}

/**
 * ✅ DELETE handler (no guesses)
 * - Calls the canonical upstream endpoint only.
 * - Returns JSON because the client uses fetch().
 */
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = parseSongId(ctx);
  if (!idNum) {
    return NextResponse.json({ message: "Μη έγκυρο ID τραγουδιού" }, { status: 400 });
  }

  let API_BASE_URL: string;
  try {
    API_BASE_URL = getApiBaseUrl();
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || "Server misconfigured" }, { status: 500 });
  }

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  // ✅ Canonical endpoint (same convention as PATCH)
  const upstreamUrl = `${API_BASE_URL}/songs/${idNum}/full`;

  try {
    const res = await fetch(upstreamUrl, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });

    const data = await readBodyAsJsonOrText(res);

    if (!res.ok) {
      return NextResponse.json(
        typeof data === "string" ? { message: data || `Αποτυχία διαγραφής (${res.status})` } : data,
        { status: res.status },
      );
    }

    // could be 204 or json
    return NextResponse.json(typeof data === "string" ? { ok: true } : data ?? { ok: true }, {
      status: 200,
    });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Σφάλμα επικοινωνίας με API" },
      { status: 500 },
    );
  }
}
