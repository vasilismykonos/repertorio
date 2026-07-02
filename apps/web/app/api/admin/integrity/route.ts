import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_INTERNAL_BASE_URL = String(process.env.API_INTERNAL_BASE_URL || "").trim().replace(/\/$/, "");
const INTERNAL_API_KEY = String(process.env.INTERNAL_API_KEY || "").trim();

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (!API_INTERNAL_BASE_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { message: "Missing API_INTERNAL_BASE_URL or INTERNAL_API_KEY" },
      { status: 500 },
    );
  }

  const res = await fetch(`${API_INTERNAL_BASE_URL}/integrity/summary`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-internal-key": INTERNAL_API_KEY,
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text || "Invalid API response" };
  }

  return NextResponse.json(body, { status: res.status });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (!API_INTERNAL_BASE_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { message: "Missing API_INTERNAL_BASE_URL or INTERNAL_API_KEY" },
      { status: 500 },
    );
  }

  const payload = await req.json().catch(() => ({}));
  const res = await fetch(`${API_INTERNAL_BASE_URL}/integrity/repair`, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-internal-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify({ action: payload?.action }),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text || "Invalid API response" };
  }

  return NextResponse.json(body, { status: res.status });
}
