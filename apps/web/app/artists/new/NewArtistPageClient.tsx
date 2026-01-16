// apps/web/app/artists/new/NewArtistPageClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import ArtistForm, { type ArtistSaveResult } from "../ArtistForm";
import { normaliseReturnTo } from "@/lib/returnTo";

type ReturnParam = "composerArtistId" | "lyricistArtistId";

function normaliseReturnParam(v: string | null): ReturnParam | null {
  const s = (v ?? "").trim();
  if (s === "composerArtistId" || s === "lyricistArtistId") return s;
  return null;
}

function appendParam(url: string, key: string, value: string): string {
  // κρατάει hash αν υπάρχει
  const [basePlusQuery, hash = ""] = url.split("#");
  const sep = basePlusQuery.includes("?") ? "&" : "?";
  const out = `${basePlusQuery}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  return hash ? `${out}#${hash}` : out;
}

/**
 * Client component for creating a new artist.
 * Uses shared ActionBar button helpers (A.backLink/A.save/A.cancel)
 * and delegates fields/persistence to ArtistForm.
 */
export default function NewArtistPageClient() {
  const searchParams = useSearchParams();

  const returnTo = normaliseReturnTo(searchParams?.get("returnTo") ?? null);
  const returnParam = normaliseReturnParam(searchParams?.get("returnParam"));

  const backHref = useMemo(() => returnTo || "/artists", [returnTo]);

  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function persistForm(fd: FormData): Promise<ArtistSaveResult> {
    const res = await fetch("/api/artists/full", {
      method: "POST",
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
    const savedId = Number(data?.id ?? null);
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
    _isNew: boolean,
    _artistId: number | null,
  ): Promise<ArtistSaveResult> => {
    setSaving(true);
    try {
      return await persistForm(fd);
    } finally {
      setSaving(false);
    }
  };

  function handleSaveDone(result: ArtistSaveResult) {
    // ✅ Νέα λογική: αν υπάρχει returnTo + returnParam, επιστρέφουμε πίσω με το id
    if (returnTo && returnParam) {
      const dest = appendParam(returnTo, returnParam, String(result.id));
      router.push(dest);
      router.refresh();
      return;
    }

    // ✅ default behaviour (όπως πριν)
    router.push(`/artists/${result.id}`);
    router.refresh();
  }

  function handleCancel() {
    router.push(backHref);
  }

  function onSaveClick() {
    const form = document.getElementById("artist-form") as HTMLFormElement | null;
    form?.requestSubmit();
  }

  return (
    <>
      <ActionBar
        left={A.backLink({
          href: backHref,
          title: "Πίσω",
          disabled: saving,
        })}
        right={
          <>
            {A.save({
              disabled: saving,
              loading: saving,
              onClick: onSaveClick,
              title: "Αποθήκευση",
              label: "Αποθήκευση",
              loadingLabel: "Αποθήκευση...",
            })}

            {A.cancel({
              disabled: saving,
              onClick: handleCancel,
              title: "Άκυρο",
            })}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Νέος καλλιτέχνης</h1>

      <ArtistForm
        onSubmit={handleSubmit}
        onSaveDone={handleSaveDone}
        onCancel={handleCancel}
        hideActions
      />
    </>
  );
}
