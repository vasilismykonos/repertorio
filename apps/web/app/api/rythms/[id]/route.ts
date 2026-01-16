// apps/web/app/api/rythms/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  buildForwardHeaders,
  getApiBaseUrl,
  missingApiBaseUrlResponse,
  proxyJson,
  readBodyAsJson,
} from "../../_lib/proxy";
import { parsePositiveIntParam } from "../../_lib/params";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = parsePositiveIntParam(ctx.params.id);
  if (!idNum) {
    return NextResponse.json({ message: "Μη έγκυρο ID" }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const headers = buildForwardHeaders(req);
  return proxyJson(`${baseUrl}/rythms/${idNum}`, { method: "GET", headers });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const idNum = parsePositiveIntParam(ctx.params.id);
  if (!idNum) {
    return NextResponse.json({ message: "Μη έγκυρο ID" }, { status: 400 });
  }

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

  return proxyJson(`${baseUrl}/rythms/${idNum}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(bodyJson),
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const idNum = parsePositiveIntParam(ctx.params.id);
  if (!idNum) {
    return NextResponse.json({ message: "Μη έγκυρο ID" }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return missingApiBaseUrlResponse();

  const headers = buildForwardHeaders(req);
  return proxyJson(`${baseUrl}/rythms/${idNum}`, { method: "DELETE", headers });
}
