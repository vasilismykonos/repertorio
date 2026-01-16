// apps/web/app/songs/[id]/edit/DeleteSongButton.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";

import { A } from "@/app/components/buttons";

type Props = {
  songId: number;
  songTitle: string;
};

export default function DeleteSongButton({ songId, songTitle }: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = React.useState(false);

  async function onDelete() {
    if (isBusy) return;

    const ok = window.confirm(
      `Θέλεις σίγουρα να διαγράψεις το τραγούδι “${songTitle}” (#${songId});\n\nΗ ενέργεια δεν μπορεί να αναιρεθεί.`,
    );
    if (!ok) return;

    setIsBusy(true);
    try {
      const res = await fetch(`/api/songs/${songId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `DELETE /api/songs/${songId} απέτυχε (${res.status})`);
      }

      router.push("/songs");
      router.refresh();
    } catch (err: any) {
      alert(err?.message ? String(err.message) : "Απέτυχε η διαγραφή.");
    } finally {
      setIsBusy(false);
    }
  }

  return A.del({
    onClick: onDelete,
    disabled: isBusy,
    loading: isBusy,
    label: "Διαγραφή",
    loadingLabel: "Διαγραφή...",
    title: "Διαγραφή",
  });
}
