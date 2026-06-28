import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function getApiBase(): string {
  const base = (process.env.API_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("Missing API_INTERNAL_BASE_URL");
  return base;
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function normalizeMessage(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me?.id) {
    return NextResponse.json(
      { ok: false, error: "Χρειάζεται σύνδεση για να στείλεις μήνυμα." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const body = await req.json().catch(() => ({}));
  const message = normalizeMessage(body?.message);

  if (message.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Γράψε ένα σύντομο μήνυμα." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (message.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Το μήνυμα πρέπει να είναι έως 2000 χαρακτήρες." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const upstream = await fetch(
    `${getApiBase()}/notifications/contact-admins?userId=${encodeURIComponent(String(me.id))}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
      cache: "no-store",
    },
  );

  const upstreamBody = await readJsonSafe(upstream);
  return NextResponse.json(upstreamBody, { status: upstream.status, headers: NO_STORE_HEADERS });
}
