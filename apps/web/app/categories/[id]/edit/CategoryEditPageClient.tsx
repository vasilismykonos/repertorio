"use client";

import React, { useCallback, useState } from "react";

import ActionBar from "@/app/components/ActionBar";
import LinkButton from "@/app/components/LinkButton";
import Button from "@/app/components/Button";

import CategoryEditForm, {
  type CategoryForEdit,
  type CategoryEditActionsCtx,
} from "./CategoryEditForm";

type Props = {
  idNum: number;
  category: CategoryForEdit;
};

export default function CategoryEditPageClient({ idNum, category }: Props) {
  const [actions, setActions] = useState<CategoryEditActionsCtx | null>(null);

  const onActionsChange = useCallback((ctx: CategoryEditActionsCtx) => {
    setActions(ctx);
  }, []);

  const busy = actions?.isBusy ?? false;

  return (
    <>
      <ActionBar
        left={
          <LinkButton
            href={`/categories/${idNum}`}
            variant="secondary"
            title="Πίσω στην κατηγορία"
            style={{ padding: "6px 12px", fontSize: 14 }}
          >
            ← Πίσω
          </LinkButton>
        }
        right={
          <>
            <Button
              type="button"
              variant="primary"
              disabled={!actions || busy}
              onClick={() => actions?.onSaveClick()}
              title="Αποθήκευση"
            >
              {actions?.saving ? "Αποθήκευση..." : "Αποθήκευση"}
            </Button>

            <Button
              type="button"
              variant="danger"
              disabled={!actions || busy}
              onClick={() => actions?.onDeleteClick()}
              title="Διαγραφή κατηγορίας"
            >
              {actions?.isDeleting ? "Διαγραφή..." : "Διαγραφή"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={!actions || busy}
              onClick={() => actions?.onCancelClick()}
              title="Άκυρο"
            >
              Άκυρο
            </Button>
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Επεξεργασία κατηγορίας</h1>

      <CategoryEditForm category={category} onActionsChange={onActionsChange} />
    </>
  );
}
