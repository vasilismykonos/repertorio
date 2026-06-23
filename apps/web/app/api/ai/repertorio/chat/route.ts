import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function getAgentBaseUrl(): string {
  return (
    process.env.AEOLOS_AGENT_BASE_URL ||
    process.env.REPERTORIO_AGENT_BASE_URL ||
    "http://127.0.0.1:8787/api/agent"
  ).replace(/\/+$/, "");
}

function getAgentKey(): string {
  return (
    process.env.AEOLOS_AGENT_INTERNAL_KEY ||
    process.env.REPERTORIO_AGENT_INTERNAL_KEY ||
    ""
  ).trim();
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function sanitizePageContext(value: any) {
  if (!value || typeof value !== "object") return null;

  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = rawItems
    .map((item: any) => ({
      id: Number(item?.id),
      title: String(item?.title || "").slice(0, 160),
      firstLyrics: String(item?.firstLyrics || "").slice(0, 220),
      category: item?.category == null ? null : String(item.category).slice(0, 80),
      rythm: item?.rythm == null ? null : String(item.rythm).slice(0, 80),
      originalKey: item?.originalKey == null ? null : String(item.originalKey).slice(0, 20),
      status: item?.status == null ? null : String(item.status).slice(0, 40),
      views: Number.isFinite(Number(item?.views)) ? Number(item.views) : null,
      hasChords: Boolean(item?.hasChords),
      hasScore: Boolean(item?.hasScore),
      isInstrumental: Boolean(item?.isInstrumental),
      tags: Array.isArray(item?.tags) ? item.tags.map((tag: any) => String(tag).slice(0, 60)).slice(0, 6) : [],
    }))
    .filter((item: any) => Number.isFinite(item.id) && item.id > 0 && item.title)
    .slice(0, 12);

  return {
    source: String(value.source || "").slice(0, 40),
    total: Number.isFinite(Number(value.total)) ? Number(value.total) : items.length,
    filters: value.filters && typeof value.filters === "object" ? value.filters : null,
    items,
  };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const agentKey = getAgentKey();
  if (!agentKey) {
    return NextResponse.json(
      { error: "Repertorio AI is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const body = await req.json().catch(() => null);
  const message = String(body?.message || "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "Γράψε μια ερώτηση για το Repertorio AI." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { error: "Η ερώτηση είναι πολύ μεγάλη. Κράτησέ την πιο συγκεκριμένη." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 185_000);

  try {
    const upstream = await fetch(`${getAgentBaseUrl()}/repertorio/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-aeolos-agent-key": agentKey,
      },
      body: JSON.stringify({
        message,
        pageContext: sanitizePageContext(body?.pageContext),
        user: {
          id: user.id,
          email: user.email,
          username: user.username ?? null,
          displayName: user.displayName ?? null,
          role: user.role,
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await readJsonSafe(upstream);
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: NO_STORE_HEADERS,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.name === "AbortError"
            ? "Το Repertorio AI άργησε να απαντήσει."
            : "Δεν μπόρεσα να μιλήσω με το Repertorio AI.",
      },
      { status: error?.name === "AbortError" ? 504 : 502, headers: NO_STORE_HEADERS },
    );
  } finally {
    clearTimeout(timeout);
  }
}
