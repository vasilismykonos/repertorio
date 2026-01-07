"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import CategoryForm, {
  type CategoryForEdit,
  type CategoryFormValues,
} from "../../CategoryForm";

import { apiFetchJson, apiFetchOk } from "@/lib/apiClient";
import { appendQueryParam, normaliseReturnTo } from "@/lib/returnTo";

type CategorySaveResult = { id: number; slug: string | null };

export type CategoryEditActionsCtx = {
  isEdit: boolean;
  isBusy: boolean;
  saving: boolean;
  isDeleting: boolean;
  onSaveClick: () => void;
  onDeleteClick: () => void;
  onCancelClick: () => void;
};

type Props = {
  category: CategoryForEdit;

  /**
   * ✅ Το page (ActionBar) παίρνει εδώ handlers+state
   * για να αποδώσει τα κουμπιά στη δεξιά πλευρά.
   */
  onActionsChange: (ctx: CategoryEditActionsCtx) => void;
};

export default function CategoryEditForm({ category, onActionsChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnTo = normaliseReturnTo(searchParams?.get("returnTo") ?? null);

  const isEdit = true; // edit page => πάντα true
  const categoryId = category.id;

  const formRef = useRef<HTMLFormElement | null>(null);

  const [value, setValue] = useState<CategoryFormValues>({
    title: category.title ?? "",
    slug: category.slug ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const backAfterDelete = useMemo(() => {
    if (returnTo) return returnTo;
    return "/categories";
  }, [returnTo]);

  const isBusy = saving || isDeleting;

  function handleCancel() {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.push(`/categories/${categoryId}`);
  }

  function goAfterSave(result: CategorySaveResult) {
    if (returnTo) {
      const back = appendQueryParam(returnTo, "categoryId", String(result.id));
      router.push(back);
      router.refresh();
      return;
    }
    router.push(`/categories/${result.id}`);
    router.refresh();
  }

  async function doSave(): Promise<CategorySaveResult> {
    const fd = new FormData();
    fd.append("title", value.title.trim());
    if (value.slug && value.slug.trim()) fd.append("slug", value.slug.trim());

    const data = await apiFetchJson<any>(`/api/categories/${categoryId}`, {
      method: "PATCH",
      body: fd,
    });

    const savedId = Number(data?.id ?? categoryId);
    if (!Number.isFinite(savedId) || savedId <= 0) {
      throw new Error("Δεν επιστράφηκε έγκυρο id από το API.");
    }

    return {
      id: savedId,
      slug: String(data?.slug ?? "").trim() || null,
    };
  }

  async function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy) return;

    setSaving(true);
    setError(null);
    try {
      const result = await doSave();
      setValue((v) => ({ ...v, slug: result.slug ?? "" }));
      goAfterSave(result);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = window.confirm(
      "Θέλεις σίγουρα να διαγράψεις αυτή την κατηγορία;\nΗ ενέργεια δεν αναιρείται.",
    );
    if (!ok) return;

    setIsDeleting(true);
    try {
      await apiFetchOk(`/api/categories/${categoryId}`, { method: "DELETE" });
      router.push(backAfterDelete);
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "Αποτυχία διαγραφής.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ✅ ενημερώνει το ActionBar (page) σε κάθε αλλαγή state
  useEffect(() => {
    onActionsChange({
      isEdit,
      isBusy,
      saving,
      isDeleting,
      onSaveClick: () => formRef.current?.requestSubmit(),
      onDeleteClick: handleDelete,
      onCancelClick: handleCancel,
    });
    // intentionally depends on state
  }, [onActionsChange, isBusy, saving, isDeleting]);

  return (
    <form ref={formRef} onSubmit={onFormSubmit}>
      <CategoryForm value={value} onChange={setValue} error={error} disabled={isBusy} />
    </form>
  );
}

export type { CategoryForEdit } from "../../CategoryForm";
