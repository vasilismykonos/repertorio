"use client";

import React from "react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import CategoryForm, { type CategoryForEdit } from "../../CategoryForm";
import { useDictionaryEditor } from "../../../hooks/useDictionaryEditor";

type Props = {
  idNum: number;
  category: CategoryForEdit;
};

export default function CategoryEditPageClient({ idNum, category }: Props) {
  const { value, setValue, error, actionsCtx } = useDictionaryEditor({
    id: idNum,
    initialValue: {
      title: category.title ?? "",
      slug: category.slug ?? "",
    },
    basePath: "/categories",
    apiBasePath: "/api/categories",
    returnIdParam: "categoryId",
  });

  const busy = actionsCtx.isBusy;

  return (
    <>
      <ActionBar
        left={
          A.backLink({
            href: `/categories/${idNum}`,
            title: "Πίσω στην κατηγορία",
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
              title: "Διαγραφή κατηγορίας",
            })}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Επεξεργασία κατηγορίας</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          actionsCtx.onSaveClick();
        }}
      >
        <CategoryForm
          value={value}
          onChange={setValue}
          error={error ?? undefined}
          disabled={busy}
        />
      </form>
    </>
  );
}
