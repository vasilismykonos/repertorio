"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import LinkButton from "@/app/components/LinkButton";
import Button from "@/app/components/Button";

import CategoryForm, { type CategoryFormValues } from "../CategoryForm";

import { apiFetchJson } from "@/lib/apiClient";
import { appendQueryParam, normaliseReturnTo } from "@/lib/returnTo";

type CategorySaveResult = { id: number; slug: string | null };

export default function NewCategoryPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnTo = normaliseReturnTo(searchParams?.get("returnTo") ?? null);

  const formRef = useRef<HTMLFormElement | null>(null);

  const [value, setValue] = useState<CategoryFormValues>({
    title: "",
    slug: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBusy = saving;

  const backHref = useMemo(() => returnTo || "/categories", [returnTo]);

  function handleCancel() {
    router.push(backHref);
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
    const title = value.title.trim();
    const slug = value.slug.trim();

    if (!title) {
      throw new Error("Ο τίτλος είναι υποχρεωτικός.");
    }

    const fd = new FormData();
    fd.append("title", title);
    if (slug) fd.append("slug", slug);

    const data = await apiFetchJson<any>("/api/categories", {
      method: "POST",
      body: fd,
    });

    const savedId = Number(data?.id);
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
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const result = await doSave();

      // Αν το API παράγει/διορθώνει slug, ενημέρωσε local state
      setValue((v) => ({ ...v, slug: result.slug ?? v.slug }));

      goAfterSave(result);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ActionBar
        left={
          <LinkButton
            href={backHref}
            variant="secondary"
            title="Πίσω"
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
              disabled={isBusy}
              onClick={() => formRef.current?.requestSubmit()}
              title="Αποθήκευση"
            >
              {saving ? "Αποθήκευση..." : "Αποθήκευση"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={isBusy}
              onClick={handleCancel}
              title="Άκυρο"
            >
              Άκυρο
            </Button>
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Νέα κατηγορία</h1>

      <form ref={formRef} onSubmit={onFormSubmit}>
        <CategoryForm
          value={value}
          onChange={setValue}
          error={error}
          disabled={isBusy}
        />
      </form>
    </>
  );
}
