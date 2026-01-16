// apps/web/app/categories/new/NewCategoryPageClient.tsx
"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { Button, LinkButton } from "@/app/components/buttons";

import CategoryForm from "../CategoryForm";

import { normaliseReturnTo } from "@/lib/returnTo";
import { useDictionaryEditor } from "../../hooks/useDictionaryEditor";

export default function NewCategoryPageClient() {
  // Determine the returnTo for computing the back link.
  const searchParams = useSearchParams();
  const returnTo = normaliseReturnTo(searchParams?.get("returnTo") ?? null);
  const backHref = useMemo(() => returnTo || "/categories", [returnTo]);

  // Generic dictionary editor hook for creating a category.
  const { value, setValue, error, actionsCtx } = useDictionaryEditor({
    id: null,
    basePath: "/categories",
    apiBasePath: "/api/categories",
    returnIdParam: "categoryId",
  });

  return (
    <>
      <ActionBar
        left={
          <LinkButton
            href={backHref}
            variant="secondary"
            title="Πίσω"
            action="back"                      // 🔹 ArrowLeft icon, icon-only σε small
            style={{ padding: "6px 12px", fontSize: 14 }}
          >
            Πίσω
          </LinkButton>
        }
        right={
          <>
            <Button
              type="button"
              variant="primary"
              disabled={actionsCtx.isBusy}
              onClick={actionsCtx.onSaveClick}
              title="Αποθήκευση"
              action="save"                    // 🔹 Save icon, icon-only σε small
            >
              {actionsCtx.saving ? "Αποθήκευση..." : "Αποθήκευση"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={actionsCtx.isBusy}
              onClick={actionsCtx.onCancelClick}
              title="Άκυρο"
              action="cancel"                  // 🔹 X icon, icon-only σε small
            >
              Άκυρο
            </Button>
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Νέα κατηγορία</h1>

      {/* Wrap form so that pressing Enter submits via onSaveClick. */}
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
          disabled={actionsCtx.isBusy}
        />
      </form>
    </>
  );
}
