// apps/web/app/artists/[id]/edit/ArtistEditForm.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import ArtistForm, {
  type ArtistForEdit,
  type ArtistSaveResult,
} from "../../ArtistForm";

/**
 * Wrapper component around the pure ArtistForm. This file preserves the
 * existing import path so that other parts of the codebase which import
 * ArtistEditForm continue to work. It delegates persistence to the
 * `/api/artists` Next.js API routes and handles navigation after a
 * successful save or when the user cancels the edit.
 */

type Props = {
  /** Optional artist initial data. When omitted the form operates in create mode. */
  artist?: ArtistForEdit | null;
};

export default function ArtistEditForm({ artist }: Props) {
  const router = useRouter();

  /**
   * Persist the form data via the Next.js API routes (BFF).
   * This guarantees:
   * - cookies / NextAuth session forwarding
   * - multipart streaming safety
   * - zero coupling with upstream API URLs
   */
  async function handleSubmit(
    fd: FormData,
    isNew: boolean,
    artistId: number | null,
  ): Promise<ArtistSaveResult> {
    const url = isNew
      ? "/api/artists/full"
      : `/api/artists/${artistId}/full`;

    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      credentials: "include",
      body: fd,
    });

    if (!res.ok) {
      let message = `Αποτυχία αποθήκευσης (HTTP ${res.status})`;
      try {
        const data = await res.json().catch(() => null);
        if (data?.message) {
          message = Array.isArray(data.message)
            ? data.message.join(", ")
            : String(data.message);
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const data = await res.json().catch(() => null);
    const savedId = Number(data?.id ?? artistId);

    if (!Number.isFinite(savedId) || savedId <= 0) {
      throw new Error("Δεν επιστράφηκε έγκυρο id από το API.");
    }

    return {
      id: savedId,
      imageUrl: String(data?.imageUrl ?? "").trim() || null,
    };
  }

  /** After saving, navigate to the artist profile and refresh cache */
  function handleSaveDone(result: ArtistSaveResult) {
    router.push(`/artists/${result.id}`);
    router.refresh();
  }

  /** Cancel navigation */
  function handleCancel(id: number | null) {
    if (id) {
      router.push(`/artists/${id}`);
    } else {
      router.push("/artists");
    }
  }

  return (
    <ArtistForm
      artist={artist}
      onSubmit={handleSubmit}
      onSaveDone={handleSaveDone}
      onCancel={handleCancel}
    />
  );
}

/**
 * Re-export for backwards compatibility.
 * This ensures existing imports keep working:
 * `import ArtistEditForm, { ArtistForEdit } from "./ArtistEditForm"`
 */
export type { ArtistForEdit } from "../../ArtistForm";
