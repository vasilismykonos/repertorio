// apps/web/app/api/songs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

type ApiSongResponse = {
  id: number;
  title: string;
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

  // ✅ πλέον τα στέλνουμε (αφού στο API updateSong τα υποστηρίζεις)
  assets?: any[] | null;

  // ✅ NEW
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
        try { window.location.replace(${JSON.stringify(safePath)}); }
        catch (e) { window.location.href = ${JSON.stringify(safePath)}; }
      })();
    </script>
  </body>
</html>`;
}

function parseJsonSafe<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function normalizeTagIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const ids = input
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.trunc(n));
  return Array.from(new Set(ids));
}

function normalizeArray(input: unknown): any[] {
  return Array.isArray(input) ? input : [];
}

function toNumberOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toStringOrEmpty(v: FormDataEntryValue | null): string {
  if (typeof v !== "string") return "";
  return v;
}

function toStringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const s = v;
  if (s.trim() === "") return null;
  return s;
}

function pickForwardHeader(req: NextRequest, name: string): string | undefined {
  const v = req.headers.get(name);
  return v && v.trim() ? v : undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const idNum = Number(params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    const html = buildRedirectHtml("/songs?error=1");
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const formData = await req.formData();

  // --- βασικά fields (ό,τι υπήρχε και πριν) ---
  const title = toStringOrEmpty(formData.get("title")).trim();

  const firstLyrics = toStringOrNull(formData.get("firstLyrics"));
  const lyrics = toStringOrNull(formData.get("lyrics"));
  const characteristics = toStringOrNull(formData.get("characteristics"));

  const originalKey = toStringOrNull(formData.get("originalKey"));
  const chords = toStringOrNull(formData.get("chords"));

  const status = toStringOrNull(formData.get("status"));

  const categoryId = toNumberOrNull(formData.get("categoryId"));
  const rythmId = toNumberOrNull(formData.get("rythmId"));
  const makamId = toNumberOrNull(formData.get("makamId"));

  // --- tags ---
  const parsedTagIds = parseJsonSafe<unknown>(formData.get("tagIdsJson"), []);
  const tagIds = normalizeTagIds(parsedTagIds);

  // --- assets (NEW) ---
  const parsedAssets = parseJsonSafe<unknown>(formData.get("assetsJson"), []);
  const assets = normalizeArray(parsedAssets);

  // --- versions (NEW) ---
  const parsedVersions = parseJsonSafe<unknown>(formData.get("versionsJson"), []);
  const versions = normalizeArray(parsedVersions);

  const body: PatchSongBody = {
    title: title || undefined,

    // κρατάμε τη λογική του παλιού: στέλνουμε τα fields όπως υπάρχουν στη φόρμα
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

    // ✅ τώρα τα στέλνουμε
    assets,
    versions,
  };

  let ok = true;

  // ✅ Forward auth context στο upstream API
  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  const upstreamUrl = `${API_BASE_URL}/songs/${idNum}`;

  try {
    const res = await fetch(upstreamUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      ok = false;
      const text = await res.text().catch(() => "");
      console.error(
        "Update song failed",
        JSON.stringify(
          {
            id: idNum,
            upstreamUrl,
            status: res.status,
            statusText: res.statusText,
            bodySent: body,
            responseText: text?.slice(0, 2000),
          },
          null,
          2,
        ),
      );
    } else {
      await res.json().catch(() => null as ApiSongResponse | null);
    }
  } catch (err) {
    ok = false;
    console.error("Update song threw error", { id: idNum, upstreamUrl, err });
  }

  const targetPath = ok ? `/songs/${idNum}` : `/songs/${idNum}?error=1`;
  const html = buildRedirectHtml(targetPath);

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
