"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function DeleteArtistButton({ artistId }: { artistId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    if (busy) return;
    setErr(null);

    const ok = confirm(
      "⚠️ Είσαι σίγουρος ότι θέλεις να διαγράψεις ΟΡΙΣΤΙΚΑ αυτόν τον καλλιτέχνη;",
    );
    if (!ok) return;

    try {
      setBusy(true);

      const res = await fetch(`/api/artists/${artistId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        // ✅ κρίσιμο: βεβαιώνει ότι cookies/session πάνε στο route handler
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message || `Αποτυχία διαγραφής (${res.status})`);
      }

      router.push("/artists");
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? "Αποτυχία διαγραφής"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        style={{
          fontSize: 13,
          color: "#ff6b6b",
          background: "transparent",
          border: "1px solid #552222",
          padding: "4px 8px",
          borderRadius: 999,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        🗑 Διαγραφή καλλιτέχνη
      </button>

      {err ? (
        <div style={{ marginTop: 6, color: "#ffb4b4", fontSize: 12 }}>{err}</div>
      ) : null}
    </div>
  );
}
