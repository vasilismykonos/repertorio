import { NextRequest } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  proxyJson,
} from "../../_lib/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const url = new URL(`${baseUrl}/songs/offline-changes`);
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return proxyJson(url.toString(), {
    method: "GET",
    headers: buildForwardHeaders(req, { Accept: "application/json" }),
  });
}
