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
