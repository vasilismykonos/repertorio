// apps/web/app/me/singer-tunes/settings/page.tsx
import React from "react";
import SingerTunesSettingsClient from "./settings-client";

export default function SingerTunesSettingsPage({
  searchParams,
}: {
  searchParams?: { from?: string };
}) {
  const fromRaw = searchParams?.from;
  const from = typeof fromRaw === "string" ? fromRaw : null;

  // security: μόνο relative paths
  const backHref =
    from && from.startsWith("/") && !from.startsWith("//") ? from : "/songs";

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Ρυθμίσεις Singer Tunes</h1>
      <SingerTunesSettingsClient backHref={backHref} />
    </div>
  );
}
