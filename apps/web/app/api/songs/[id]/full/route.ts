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

  const headers = buildForwardHeaders(req, {
    "content-type": "application/json",
  });

  return proxyJson(`${baseUrl}/songs/${songId}/full`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(bodyJson),
  });
}
