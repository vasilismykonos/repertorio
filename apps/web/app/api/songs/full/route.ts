// apps/web/app/api/songs/full/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  proxyJson,
  readBodyAsJson,
} from "../../_lib/proxy";

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

  /**
   * IMPORTANT (based on apps/api/src/songs/songs.controller.ts):
   * normalizeSongBodyFromMultipart() uses parseJsonSafe(body.json, {}) and then src = jsonEnvelope.
   * If `json` is missing, jsonEnvelope becomes {} and src loses the actual payload.
   * So we MUST wrap the song payload inside a string field `json`.
   */
  const upstreamBody: Record<string, any> = {
    json: JSON.stringify(bodyJson),
  };

  // Credits are parsed from top-level fields too, so forward them explicitly if present.
  if (bodyJson.composerArtistIds !== undefined) {
    upstreamBody.composerArtistIds = bodyJson.composerArtistIds;
  }
  if (bodyJson.lyricistArtistIds !== undefined) {
    upstreamBody.lyricistArtistIds = bodyJson.lyricistArtistIds;
  }

  // If UI ever sends creditsJson/credits as objects, stringify them for API's parseJsonSafe()
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

  return proxyJson(`${baseUrl}/songs/full`, {
    method: "POST",
    headers,
    body: JSON.stringify(upstreamBody),
  });
}
