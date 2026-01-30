// apps/web/app/songs/[id]/singer-tunes/page.tsx
import { notFound } from "next/navigation";
import { fetchJson } from "@/lib/api";

import SingerTunesPageClient from "./SingerTunesPageClient";

function normalizeSongId(paramsId: string): number | null {
  const n = Number(paramsId);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
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

  // ✅ ΜΗΝ κάνεις server fetch για singer-tunes.
  // Το Client component ήδη τα φορτώνει μέσω /api/songs/:id/singer-tunes (same-origin).
  const initialRows: any[] = [];

  return (
    <SingerTunesPageClient
      songId={songId}
      songTitle={songTitle}
      songOriginalKey={songOriginalKey}
      songSign={songSign}
      initialRows={initialRows}
    />
  );
}
