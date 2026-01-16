// apps/web/app/settings/tabs/RythmsTab.tsx
"use client";

import { useEffect, useState } from "react";
import RythmsPageClient, {
  type RythmListItem,
  type RythmSortKey,
} from "@/app/rythms/RythmsPageClient";

export default function RythmsTab() {
  const [rythms, setRythms] = useState<RythmListItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const sort: RythmSortKey = "title_asc";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(false);

      try {
        const res = await fetch("/api/v1/rythms", {
          method: "GET",
          headers: { accept: "application/json" },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as RythmListItem[];
        if (!cancelled) setRythms(Array.isArray(json) ? json : []);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setRythms([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !loadError && rythms.length === 0) {
    return <div style={{ padding: 16, color: "#fff" }}>Φόρτωση ρυθμών…</div>;
  }

  return (
    <div style={{ padding: 0, fontSize: 14, lineHeight: 1.2 }}>
      <RythmsPageClient
        q=""
        sort={sort}
        take={50}
        skip={0}
        rythms={rythms}
        loadError={loadError}
      />
    </div>
  );
}
