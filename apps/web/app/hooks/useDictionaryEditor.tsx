"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { appendQueryParam, normaliseReturnTo } from "@/lib/returnTo";
import { apiFetchJson, apiFetchOk } from "@/lib/apiClient";

/**
 * Generic hook to manage create/edit/delete operations for simple dictionary
 * resources such as categories.  It encapsulates the common logic for
 * handling form state, interacting with the API, navigation after save
 * or delete and exposing an actions context for the page ActionBar.
 */

export type DictionaryValues = {
  /**
   * Required title for the resource.  Leading and trailing whitespace will
   * be trimmed before submission.
   */
  title: string;
  /**
   * Optional slug.  If left blank the backend may generate one from the
   * provided title.  Leading/trailing whitespace will be trimmed.
   */
  slug: string;
};

export type DictionaryEditorConfig = {
  /**
   * The id of the entity being edited.  Use null for new entities.
   */
  id: number | null;
  /**
   * Base path for the resource on the site (e.g. '/categories').  This
   * controls the default redirect after saving or cancelling when no
   * `returnTo` query parameter is present.
   */
  basePath: string;
  /**
   * Base path for the API proxy (e.g. '/api/categories').  POSTs and
   * PATCHes will be made relative to this path.
   */
  apiBasePath: string;
  /**
   * Query parameter name used to append the newly created/edited id when
   * returning back via `returnTo`.  For categories this is 'categoryId'.
   */
  returnIdParam: string;
  /**
   * Optional initial form values.  Omit when creating a new entity.
   */
  initialValue?: DictionaryValues;
};

export type DictionaryEditorActionsCtx = {
  /**
   * True when editing an existing entity (id is not null).
   */
  isEdit: boolean;
  /**
   * True when a save or delete operation is in progress.
   */
  isBusy: boolean;
  /**
   * True when a save operation is in progress.
   */
  saving: boolean;
  /**
   * True when a delete operation is in progress.
   */
  isDeleting: boolean;
  /**
   * Handler for triggering a save.  Should be bound to the Save button.
   */
  onSaveClick: () => void;
  /**
   * Handler for triggering a delete.  Should be bound to the Delete button
   * only when `isEdit` is true.
   */
  onDeleteClick: () => void;
  /**
   * Handler for cancelling changes.  Returns to the appropriate page.
   */
  onCancelClick: () => void;
};

/**
 * useDictionaryEditor is a hook that centralises the common behaviour for
 * editing dictionary-like resources.  It handles form state management,
 * communicating with the API, and navigation logic based on the `returnTo`
 * query parameter.  It exposes both the form state and an actions context
 * suitable for wiring into a page ActionBar.
 */
export function useDictionaryEditor(config: DictionaryEditorConfig) {
  const { id, basePath, apiBasePath, returnIdParam, initialValue } = config;
  const router = useRouter();
  const searchParams = useSearchParams();

  // Compute the normalised returnTo once on mount.  If absent then null.
  const returnTo = normaliseReturnTo(searchParams?.get("returnTo") ?? null);

  // Form state: title and slug.  Initialise from provided initialValue or blank.
  const [value, setValue] = useState<DictionaryValues>(() => {
    return initialValue ?? { title: "", slug: "" };
  });

  // Track saving/deleting state and any validation error messages.
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine if the page is currently busy.
  const isBusy = saving || isDeleting;

  /**
   * Navigate after saving an entity.  When a returnTo is present, append
   * the id and refresh.  Otherwise go to basePath or basePath/id for
   * new entities.
   */
  function goAfterSave(savedId: number) {
    if (returnTo) {
      const back = appendQueryParam(returnTo, returnIdParam, String(savedId));
      router.push(back);
      router.refresh();
      return;
    }
    // If editing, redirect to the entity's detail page.  If creating,
    // redirect to the new entity page as well.
    if (savedId) {
      router.push(`${basePath}/${savedId}`);
    } else {
      router.push(basePath);
    }
    router.refresh();
  }

  /**
   * Save the current form values.  Uses POST for create and PATCH for edit.
   * Returns the saved id and slug from the API.  Throws on error.
   */
  async function doSave(): Promise<{ id: number; slug: string | null }> {
    const title = value.title.trim();
    const slug = value.slug.trim();
    if (!title) {
      throw new Error("Ο τίτλος είναι υποχρεωτικός.");
    }
    const fd = new FormData();
    fd.append("title", title);
    if (slug) fd.append("slug", slug);
    let url: string;
    let method: string;
    if (id == null) {
      url = apiBasePath;
      method = "POST";
    } else {
      url = `${apiBasePath}/${id}`;
      method = "PATCH";
    }
    const data = await apiFetchJson<any>(url, { method, body: fd });
    const savedId = Number(data?.id ?? id);
    if (!Number.isFinite(savedId) || savedId <= 0) {
      throw new Error("Δεν επιστράφηκε έγκυρο id από το API.");
    }
    // Prefer slug returned from the API if present; otherwise keep the current slug
    const savedSlug = String(data?.slug ?? "").trim() || null;
    return { id: savedId, slug: savedSlug };
  }

  /**
   * Handler for submitting the form.  Wraps doSave and updates state.
   */
  async function handleSave() {
    if (isBusy) return;
    setSaving(true);
    setError(null);
    try {
      const result = await doSave();
      // If the backend generated/fixed the slug, reflect it in the local state.
      setValue((v) => ({ ...v, slug: result.slug ?? v.slug }));
      goAfterSave(result.id);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Handler for cancelling edits.  Returns to the previous page based on
   * returnTo (if present) or the basePath/list/detail page.
   */
  function handleCancel() {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    // If editing go back to detail page; otherwise go to list page.
    if (id != null) {
      router.push(`${basePath}/${id}`);
    } else {
      router.push(basePath);
    }
  }

  /**
   * Handler for deleting the entity.  Confirms with the user and then
   * performs the DELETE request.  After deletion, navigates back to the
   * list or returnTo page.  Only available when `id` is not null.
   */
  async function handleDelete() {
    if (id == null) return;
    const ok = window.confirm(
      `Θέλεις σίγουρα να διαγράψεις αυτή τη καταχώρηση;\nΗ ενέργεια δεν αναιρείται.`,
    );
    if (!ok) return;
    setIsDeleting(true);
    try {
      await apiFetchOk(`${apiBasePath}/${id}`, { method: "DELETE" });
      // After delete, go back to returnTo or list page
      if (returnTo) {
        router.push(returnTo);
      } else {
        router.push(basePath);
      }
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "Αποτυχία διαγραφής.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Construct the actions context used by the ActionBar.  It updates
  // whenever the busy state changes.
  const actionsCtx: DictionaryEditorActionsCtx = {
    isEdit: id != null,
    isBusy,
    saving,
    isDeleting,
    onSaveClick: handleSave,
    onDeleteClick: handleDelete,
    onCancelClick: handleCancel,
  };

  return {
    value,
    setValue,
    error,
    actionsCtx,
  };
}