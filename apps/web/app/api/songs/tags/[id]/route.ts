// apps/web/app/api/songs/tags/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  proxyJson,
  readBodyAsJson,
} from "../../../_lib/proxy";

type RouteParams = { params: { id: string } };

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  return id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const id = parseId(params.id);
  if (!id) return NextResponse.json({ message: "Invalid tag id" }, { status: 400 });

  let bodyJson: Record<string, any>;
  try {
    bodyJson = await readBodyAsJson(req);
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Invalid request body" },
      { status: 400 },
    );
  }

  const headers = buildForwardHeaders(req, { "content-type": "application/json" });

  return proxyJson(`${baseUrl}/songs/tags/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(bodyJson),
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const id = parseId(params.id);
  if (!id) return NextResponse.json({ message: "Invalid tag id" }, { status: 400 });

  const headers = buildForwardHeaders(_req);
  return proxyJson(`${baseUrl}/songs/tags/${id}`, { method: "DELETE", headers });
}
