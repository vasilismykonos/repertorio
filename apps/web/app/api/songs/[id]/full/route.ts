// apps/web/app/api/songs/[id]/full/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  proxyJson,
  readBodyAsJson,
} from "../../../_lib/proxy";
import { forwardSearchParams } from "../../../_lib/query";

type RouteParams = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const songId = Number(params.id);
  if (!Number.isFinite(songId) || songId <= 0) {
    return NextResponse.json({ message: "Invalid song id" }, { status: 400 });
  }

  const url = new URL(`${baseUrl}/songs/${songId}`);
  forwardSearchParams(req, url);

  const headers = buildForwardHeaders(req);
  return proxyJson(url.toString(), { method: "GET", headers });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const songId = Number(params.id);
  if (!Number.isFinite(songId) || songId <= 0) {
    return NextResponse.json({ message: "Invalid song id" }, { status: 400 });
  }

  let bodyJson: Record<string, any>;
  try {
    bodyJson = await readBodyAsJson(req);
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Invalid request body" },
      { status: 400 },
    );
  }

  // Same reason as POST /songs/full: API normalizer expects `json` string
  const upstreamBody: Record<string, any> = {
    json: JSON.stringify(bodyJson),
  };

  if (bodyJson.composerArtistIds !== undefined) {
    upstreamBody.composerArtistIds = bodyJson.composerArtistIds;
  }
  if (bodyJson.lyricistArtistIds !== undefined) {
    upstreamBody.lyricistArtistIds = bodyJson.lyricistArtistIds;
  }

  if (bodyJson.creditsJson !== undefined) {
    upstreamBody.creditsJson =
      typeof bodyJson.creditsJson === "string"
        ? bodyJson.creditsJson
        : JSON.stringify(bodyJson.creditsJson);
  }
  if (bodyJson.credits !== undefined) {
    upstreamBody.credits =
      typeof bodyJson.credits === "string"
        ? bodyJson.credits
        : JSON.stringify(bodyJson.credits);
  }

  const headers = buildForwardHeaders(req, { "content-type": "application/json" });

  return proxyJson(`${baseUrl}/songs/${songId}/full`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(upstreamBody),
  });
}
