"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import ArtistForm, {
  type ArtistForEdit,
  type ArtistSaveResult,
} from "../../ArtistForm";

type Props = {
  idNum: number;
  artist: ArtistForEdit;
};

export default function ArtistEditPageClient({ idNum, artist }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function persistForm(
    fd: FormData,
    isNew: boolean,
    artistId: number | null,
  ): Promise<ArtistSaveResult> {
    const url = isNew ? "/api/artists/full" : `/api/artists/${artistId}/full`;
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

  const handleSubmit = async (
    fd: FormData,
    isNew: boolean,
    artistId: number | null,
  ): Promise<ArtistSaveResult> => {
    setSaving(true);
    try {
      return await persistForm(fd, isNew, artistId);
    } finally {
      setSaving(false);
    }
  };

  function handleSaveDone(result: ArtistSaveResult) {
    router.push(`/artists/${result.id}`);
    router.refresh();
  }

  function handleCancel(artistId: number | null) {
    router.push(artistId ? `/artists/${artistId}` : "/artists");
  }

  function onSaveClick() {
    const form = document.getElementById("artist-form") as HTMLFormElement | null;
    form?.requestSubmit();
  }

  async function onDeleteClick() {
    if (saving || deleting) return;

    const ok = window.confirm(
      "Είσαι σίγουρος ότι θέλεις να διαγράψεις τον καλλιτέχνη; Η ενέργεια δεν αναιρείται.",
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const deleteUrl = `/api/artists/${idNum}`; // άλλαξέ το αν το endpoint σου είναι διαφορετικό
      const res = await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        let message = `Αποτυχία διαγραφής (HTTP ${res.status})`;
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

      router.push("/artists");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Αποτυχία διαγραφής.";
      window.alert(msg);
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <>
      <ActionBar
        left={A.backLink({
          href: `/artists/${idNum}`,
          title: "Πίσω στο προφίλ καλλιτέχνη",
          disabled: busy,
        })}
        right={
          <>
            {A.save({
              disabled: busy,
              loading: saving,
              onClick: onSaveClick,
              title: "Αποθήκευση",
            })}

            

            {A.cancel({
              disabled: busy,
              onClick: () => handleCancel(idNum),
              title: "Άκυρο",
            })}
            {A.del({
              disabled: busy,
              loading: deleting,
              onClick: onDeleteClick,
              title: "Διαγραφή καλλιτέχνη",
            })}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Επεξεργασία καλλιτέχνη</h1>

      <ArtistForm
        artist={artist}
        onSubmit={handleSubmit}
        onSaveDone={handleSaveDone}
        onCancel={handleCancel}
        hideActions
      />
    </>
  );
}
