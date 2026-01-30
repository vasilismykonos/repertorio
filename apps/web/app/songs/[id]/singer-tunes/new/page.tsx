// apps/web/app/songs/[id]/singer-tunes/new/page.tsx
import { notFound } from "next/navigation";
import SingerTuneEditClient from "../shared/SingerTuneEditClient";

function normalizeSongId(paramsId: string) {
  const n = Number(paramsId);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export default async function NewSingerTunePage(props: { params: { id: string } }) {
  const songId = normalizeSongId(props.params.id);
  if (!songId) notFound();

  return <SingerTuneEditClient songId={songId} mode="create" />;
}
