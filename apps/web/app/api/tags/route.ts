import { NextRequest, NextResponse } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  proxyJson,
} from "../_lib/proxy";

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const upstream = new URL(`${baseUrl}/songs/tags`);
  req.nextUrl.searchParams.forEach((v, k) => upstream.searchParams.append(k, v));

  const headers = buildForwardHeaders(req);
  return proxyJson(upstream.toString(), { method: "GET", headers });
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const headers = buildForwardHeaders(req, {
    "content-type": "application/json",
  });

  const body = await req.text();
  return proxyJson(`${baseUrl}/songs/tags`, { method: "POST", headers, body });
}
