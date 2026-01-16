// apps/web/app/rythms/[id]/edit/RythmEditPageClient.tsx
"use client";

import React from "react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import RythmForm, { type RythmForEdit } from "../../RythmForm";
import { useDictionaryEditor } from "../../../hooks/useDictionaryEditor";

type Props = {
  idNum: number;
  rythm: RythmForEdit;
};

export default function RythmEditPageClient({ idNum, rythm }: Props) {
  const { value, setValue, error, actionsCtx } = useDictionaryEditor({
    id: idNum,
    initialValue: {
      title: rythm.title ?? "",
      slug: rythm.slug ?? "",
    },
    basePath: "/rythms",
    apiBasePath: "/api/rythms",
    returnIdParam: "rythmId",
  });

  const busy = actionsCtx.isBusy;

  return (
    <>
      <ActionBar
        left={
          A.backLink({
            href: `/rythms/${idNum}`,
            title: "Πίσω στον ρυθμό",
            disabled: busy,
          })
        }
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
            {A.del({
              disabled: busy,
              loading: actionsCtx.isDeleting,
              onClick: actionsCtx.onDeleteClick,
              title: "Διαγραφή ρυθμού",
            })}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Επεξεργασία ρυθμού</h1>

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
