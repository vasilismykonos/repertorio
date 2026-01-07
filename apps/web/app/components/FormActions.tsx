// apps/web/app/components/FormActions.tsx
"use client";

import React from "react";
import Button from "./Button";

type Props = {
  isBusy?: boolean;

  /** Primary action label (e.g. "Αποθήκευση"). */
  saveLabel?: string;
  /** Primary action label while busy (e.g. "Αποθήκευση..."). */
  savingLabel?: string;

  onCancel: () => void;
  cancelLabel?: string;

  /** Optional extra actions (e.g. delete button) rendered between save and cancel. */
  extraActions?: React.ReactNode;
};

/**
 * Standard action bar for forms.
 *
 * Keep the visual structure and disabled rules consistent across all forms.
 */
export default function FormActions({
  isBusy = false,
  saveLabel = "Αποθήκευση",
  savingLabel = "Αποθήκευση...",
  onCancel,
  cancelLabel = "Άκυρο",
  extraActions,
}: Props) {
  return (
    <div style={{ marginTop: 20, display: "flex", gap: 8, alignItems: "center" }}>
      <Button type="submit" disabled={isBusy} variant="primary">
        {isBusy ? savingLabel : saveLabel}
      </Button>
      {extraActions}
      <Button type="button" onClick={onCancel} disabled={isBusy} variant="secondary">
        {cancelLabel}
      </Button>
    </div>
  );
}
