// apps/web/app/api/songs/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  readBodyAsJson,
} from "../_lib/proxy";

type ApiSongResponse = {
  id: number;
  title: string;
};

type CreditsBody = {
  composerArtistIds: number[];
  lyricistArtistIds: number[];
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

  // ✅ πλέον τα στέλνουμε
  assets?: any[] | null;

  // ✅ NEW
  versions?: any[] | null;
};

function buildRedirectHtml(targetPath: string): string {
  const safePath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  return `<!DOCTYPE html>
<html lang="el">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=${safePath}" />
    <title>Redirecting...</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; }
      a { color: #2563eb; }
    </style>
  </head>
  <body>
    <p>Redirecting to <a href="${safePath}">${safePath}</a> ...</p>
    <script>window.location.replace(${JSON.stringify(safePath)});</script>
  </body>
</html>`;
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  let bodyJson: Record<string, any>;
  try {
    bodyJson = await readBodyAsJson(req);
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Invalid request body" },
      { status: 400 },
    );
  }

  const upstreamCreateUrl = `${baseUrl}/songs/full`;

  const headers = buildForwardHeaders(req, {
    "content-type": "application/json",
  });

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamCreateUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyJson),
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Upstream request failed" },
      { status: 502 },
    );
  }

  const contentType = upstreamRes.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!upstreamRes.ok) {
    const errBody = isJson ? await upstreamRes.json().catch(() => null) : null;
    return NextResponse.json(
      errBody || { message: `Upstream error (${upstreamRes.status})` },
      { status: upstreamRes.status },
    );
  }

  const created: ApiSongResponse | null = isJson
    ? await upstreamRes.json().catch(() => null)
    : null;

  if (!created?.id) {
    return NextResponse.json(
      { message: "Invalid upstream response" },
      { status: 502 },
    );
  }

  const targetPath = `/songs/${created.id}/edit`;
  const html = buildRedirectHtml(targetPath);

  return new NextResponse(html, {
    status: 303,
    headers: {
      "content-type": "text/html; charset=utf-8",
      location: targetPath,
    },
  });
}
