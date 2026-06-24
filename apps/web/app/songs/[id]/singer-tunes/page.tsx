// apps/web/app/songs/[id]/singer-tunes/page.tsx
import { notFound } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

import SingerTunesPageClient from "./SingerTunesPageClient";

function normalizeSongId(paramsId: string): number | null {
  const n = Number(paramsId);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function getInternalBaseUrl(): string | null {
  const base = (process.env.API_INTERNAL_BASE_URL || "").trim().replace(/\/$/, "");
  return base ? base : null;
}

function getInternalKey(): string | null {
  const key = (process.env.INTERNAL_API_KEY || "").trim();
  return key || null;
}

async function fetchSingerTunesForUser(songId: number, viewerEmail: string) {
  const baseUrl = getInternalBaseUrl();
  const internalKey = getInternalKey();
  if (!baseUrl || !internalKey) return { rows: [], error: "Server misconfigured" };

  const res = await fetch(`${baseUrl}/songs/${songId}/singer-tunes/internal`, {
    headers: {
      Accept: "application/json",
      "x-internal-key": internalKey,
      "x-viewer-email": viewerEmail,
    },
    cache: "no-store",
  });
  const body = await readJson(res);
  if (!res.ok) return { rows: [], error: typeof body === "object" && body ? String((body as any).message || (body as any).error || res.status) : `HTTP ${res.status}` };
  return { rows: Array.isArray(body) ? body : [], error: null };
}

export default async function SingerTunesPage({ params }: { params: { id: string } }) {
  const songId = normalizeSongId(params.id);
  if (!songId) notFound();

  // ✅ Αυτό δεν απαιτεί viewer auth (και ήδη το χρησιμοποιείς έτσι).
  const song = await fetchJson<any>(`/songs/${songId}?noIncrement=1`);
  if (!song?.id) notFound();

  const songTitle: string = String(song.title ?? "");
  const songOriginalKey: string | null = song.originalKey ?? song.original_key ?? null;

  const rawSign = song.originalKeySign ?? song.original_key_sign ?? null;
  const songSign: "+" | "-" | null = rawSign === "+" || rawSign === "-" ? rawSign : null;

  const currentUser = await getCurrentUserFromApi();
  const initialAuthRequired = !currentUser?.email;
  const initial = currentUser?.email
    ? await fetchSingerTunesForUser(songId, currentUser.email)
    : { rows: [], error: null };

  return (
    <SingerTunesPageClient
      songId={songId}
      songTitle={songTitle}
      songOriginalKey={songOriginalKey}
      songSign={songSign}
      initialRows={initial.rows}
      initialAuthRequired={initialAuthRequired}
      initialError={initial.error}
    />
  );
}
