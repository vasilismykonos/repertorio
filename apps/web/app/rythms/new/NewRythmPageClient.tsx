"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import RythmForm from "../RythmForm";

import { normaliseReturnTo } from "@/lib/returnTo";
import { useDictionaryEditor } from "../../hooks/useDictionaryEditor";

/**
 * Client component for creating a new rythm. Uses the generic
 * useDictionaryEditor hook to manage form state, saving and navigation.
 */
export default function NewRythmPageClient() {
  const searchParams = useSearchParams();
  const returnTo = normaliseReturnTo(searchParams?.get("returnTo") ?? null);
  const backHref = useMemo(() => returnTo || "/rythms", [returnTo]);

  const { value, setValue, error, actionsCtx } = useDictionaryEditor({
    id: null,
    // ✅ κρατάμε slug στο state για να εμφανίζεται/δουλεύει το input
    initialValue: {
      title: "",
      slug: "",
    },
    basePath: "/rythms",
    apiBasePath: "/api/rythms",
    returnIdParam: "rythmId",
  });

  const busy = actionsCtx.isBusy;

  return (
    <>
      <ActionBar
        left={A.backLink({
          href: backHref,
          title: "Πίσω",
          disabled: busy,
        })}
        right={
          <>
            {A.save({
              disabled: busy,
              loading: actionsCtx.saving,
              onClick: actionsCtx.onSaveClick,
              title: "Αποθήκευση",
            })}

            {A.cancel({
              disabled: busy,
              onClick: actionsCtx.onCancelClick,
              title: "Άκυρο",
            })}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Νέος ρυθμός</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          actionsCtx.onSaveClick();
        }}
      >
        <RythmForm
          value={value}
          onChange={setValue}
          error={error ?? undefined}
          disabled={busy}
        />
      </form>
    </>
  );
}
