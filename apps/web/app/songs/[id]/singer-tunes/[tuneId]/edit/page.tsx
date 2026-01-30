// apps/web/app/songs/[id]/singer-tunes/[tuneId]/edit/page.tsx
import { notFound } from "next/navigation";
import { fetchJson } from "@/lib/api";

import SingerTuneEditClient from "../../shared/SingerTuneEditClient";

type SingerTuneRow = {
  id: number;
  songId: number;
  title: string;
  tune: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeId(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export default async function EditSingerTunePage(props: { params: { id: string; tuneId: string } }) {
  const songId = normalizeId(props.params.id);
  const tuneId = normalizeId(props.params.tuneId);

  if (!songId || !tuneId) notFound();

  const rows = await fetchJson<SingerTuneRow[]>(`/songs/${songId}/singer-tunes`);
  const row = Array.isArray(rows) ? rows.find((x) => x.id === tuneId) : null;

  if (!row) notFound();

  return <SingerTuneEditClient songId={songId} mode="edit" tuneId={tuneId} initialRow={row} />;
}
