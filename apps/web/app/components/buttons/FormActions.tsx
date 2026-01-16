// apps/web/app/components/buttons/FormActions.tsx
"use client";

import React from "react";
import Button from "./Button";

type Props = {
  isBusy: boolean;

  onCancel: () => void;

  cancelLabel?: string;
  saveLabel?: string;
  savingLabel?: string;

  /**
   * Optional extra actions (e.g. delete button) rendered before Cancel/Save.
   */
  extraActions?: React.ReactNode;
};

export default function FormActions({
  isBusy,
  onCancel,
  cancelLabel = "Άκυρο",
  saveLabel = "Αποθήκευση",
  savingLabel = "Αποθήκευση...",
  extraActions,
}: Props) {
  return (
    <div
      style={{
        marginTop: 16,
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {extraActions}

      <Button type="button" variant="secondary" onClick={onCancel} disabled={isBusy}>
        {cancelLabel}
      </Button>

      <Button type="submit" variant="primary" disabled={isBusy}>
        {isBusy ? savingLabel : saveLabel}
      </Button>
    </div>
  );
}
