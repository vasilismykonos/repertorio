// apps/web/app/api/rythms/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  proxyJson,
  readBodyAsJson,
} from "../_lib/proxy";
import { forwardSearchParams } from "../_lib/query";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const url = new URL(`${baseUrl}/rythms`);
  forwardSearchParams(req, url);

  const headers = buildForwardHeaders(req);
  return proxyJson(url.toString(), { method: "GET", headers });
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

  const headers = buildForwardHeaders(req, {
    "content-type": "application/json",
  });

  return proxyJson(`${baseUrl}/rythms`, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyJson),
  });
}
