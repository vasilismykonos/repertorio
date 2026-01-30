// apps/web/app/api/users/route.ts
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

  const sp = req.nextUrl.searchParams;

  // Client sends q/take
  const q = (sp.get("q") ?? "").trim();
  const takeRaw = sp.get("take") ?? "8";
  const take = Math.max(1, Math.min(20, Number(takeRaw) || 8));

  if (!q) return NextResponse.json({ items: [] }, { status: 200 });

  // ✅ Nest expects: search + pageSize
  const url = new URL(`${baseUrl}/users`);
  url.searchParams.set("search", q);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", String(take));
  url.searchParams.set("sort", "displayName");
  url.searchParams.set("order", "asc");

  // ✅ critical: forward cookies/auth headers
  const headers = buildForwardHeaders(req);

  return proxyJson(url.toString(), {
    method: "GET",
    headers,
  });
}
