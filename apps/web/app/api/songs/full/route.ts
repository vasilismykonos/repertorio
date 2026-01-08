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

  const headers = buildForwardHeaders(req, {
    "content-type": "application/json",
  });

  return proxyJson(`${baseUrl}/songs/full`, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyJson),
  });
}
