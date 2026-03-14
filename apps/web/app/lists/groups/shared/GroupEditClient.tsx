// apps/web/app/lists/groups/shared/GroupEditClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import GroupShareSection from "./GroupShareSection";

type ListGroupDto = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
  role: "OWNER" | "LIST_EDITOR" | "VIEWER";
};

type ListGroupsIndexResponse = {
  items: ListGroupDto[];
};

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function apiGetGroups(): Promise<ApiResult<ListGroupsIndexResponse>> {
  const res = await fetch("/api/lists/groups", { cache: "no-store" });
  const body = await readJson(res);

  if (!res.ok) {
    const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: (body ?? { items: [] }) as ListGroupsIndexResponse };
}

async function apiCreateGroup(payload: {
  title: string;
  fullTitle?: string | null;
}): Promise<ApiResult<any>> {
  const res = await fetch("/api/lists/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: body };
}

async function apiUpdateGroup(
  id: number,
  payload: { title: string; fullTitle?: string | null },
): Promise<ApiResult<any>> {
  const res = await fetch(`/api/lists/groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: body };
}

async function apiDeleteGroup(id: number): Promise<ApiResult<any>> {
  const res = await fetch(`/api/lists/groups/${id}`, {
    method: "DELETE",
    cache: "no-store",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: body };
}

function getFirst(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        marginTop: 12,
        background: "rgba(255,0,0,0.06)",
        border: "1px solid rgba(255,0,0,0.2)",
        padding: 10,
        borderRadius: 10,
        color: "#fff",
      }}
    >
      {message}
    </div>
  );
}

export default function GroupEditClient(props: {
  mode: "create" | "edit";
  groupIdParam?: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { mode, groupIdParam, searchParams } = props;
  const { status } = useSession();

  const groupId = useMemo(() => {
    if (mode !== "edit") return null;
    const n = Number(groupIdParam);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
  }, [mode, groupIdParam]);

  const presetTitle = useMemo(() => getFirst(searchParams, "title").trim(), [searchParams]);
  const presetFullTitle = useMemo(
    () => getFirst(searchParams, "fullTitle").trim(),
    [searchParams],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [original, setOriginal] = useState<ListGroupDto | null>(null);
  const [title, setTitle] = useState(presetTitle);
  const [fullTitle, setFullTitle] = useState(presetFullTitle);

  const busy = loading || saving;

  const canDelete = original?.role === "OWNER";
  const canEdit =
    mode === "create"
      ? true
      : original?.role === "OWNER" || original?.role === "LIST_EDITOR";

  function goGroupsIndex() {
    if (typeof window !== "undefined") window.location.href = "/lists/groups";
  }

  async function loadForEdit() {
    if (mode !== "edit") {
      setLoading(false);
      return;
    }

    if (!groupId) {
      setErr("Μη έγκυρο id ομάδας.");
      setLoading(false);
      return;
    }

    setErr(null);
    setLoading(true);

    const r = await apiGetGroups();

    if (!r.ok) {
      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία φόρτωσης");
      }
      setOriginal(null);
      setLoading(false);
      return;
    }

    const found = (r.data.items ?? []).find((x) => x.id === groupId) ?? null;
    if (!found) {
      setErr("Η ομάδα δεν βρέθηκε ή δεν έχεις πρόσβαση.");
      setOriginal(null);
      setLoading(false);
      return;
    }

    setOriginal(found);
    setTitle((prev) => (prev.trim() ? prev : found.title ?? ""));
    setFullTitle((prev) => (prev.trim() ? prev : found.fullTitle ?? ""));
    setLoading(false);
  }

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }
    if (status === "unauthenticated") {
      setAuthRequired(true);
      setLoading(false);
      return;
    }
    void loadForEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode, groupId]);

  async function onSave() {
    if (busy) return;

    const cleanTitle = title.trim();
    const cleanFullTitle = fullTitle.trim();

    if (!cleanTitle) {
      setErr("Ο τίτλος είναι υποχρεωτικός");
      return;
    }

    setErr(null);
    setSaving(true);

    const payload = {
      title: cleanTitle,
      fullTitle: cleanFullTitle ? cleanFullTitle : null,
    };

    const r =
      mode === "edit" && groupId
        ? await apiUpdateGroup(groupId, payload)
        : await apiCreateGroup(payload);

    if (!r.ok) {
      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία αποθήκευσης");
      }
      setSaving(false);
      return;
    }

    goGroupsIndex();
  }

  async function onDelete() {
    if (busy) return;
    if (mode !== "edit" || !groupId) return;
    if (!canDelete) return;

    const ok = window.confirm("Διαγραφή αυτής της ομάδας;");
    if (!ok) return;

    setErr(null);
    setSaving(true);

    const r = await apiDeleteGroup(groupId);

    if (!r.ok) {
      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία διαγραφής");
      }
      setSaving(false);
      return;
    }

    goGroupsIndex();
  }

  function onCancel() {
    if (busy) return;
    goGroupsIndex();
  }

  if (authRequired) {
    return (
      <>
        <ActionBar
          left={A.backLink({ href: "/lists/groups", title: "Πίσω", disabled: false })}
          right={null}
        />
        <h1 style={{ fontSize: 26, marginBottom: 12 }}>
          {mode === "edit" ? "Επεξεργασία ομάδας" : "Νέα ομάδα"}
        </h1>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 12,
            maxWidth: 720,
            background: "#000000",
            color: "#fff",
          }}
        >
          Απαιτείται σύνδεση.
        </div>
      </>
    );
  }

  return (
    <>
      <ActionBar
        left={A.backLink({ href: "/lists/groups", title: "Πίσω", disabled: busy })}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {A.cancel({ disabled: busy, onClick: onCancel, title: "Άκυρο" })}

            {mode === "edit"
              ? A.del({
                  onClick: onDelete,
                  disabled: busy || !canDelete,
                  title: "Διαγραφή",
                  label: "Διαγραφή",
                })
              : null}

            {A.save({
              onClick: onSave,
              disabled: busy || !canEdit || !title.trim(),
              loading: saving,
              title: mode === "edit" ? "Ενημέρωση" : "Δημιουργία",
            })}
          </div>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 12, color: "#fff" }}>
        {mode === "edit" ? "Επεξεργασία ομάδας" : "Νέα ομάδα"}
      </h1>

      {loading ? (
        <div style={{ opacity: 0.8, color: "#fff" }}>Φόρτωση…</div>
      ) : (
        <div style={{ maxWidth: 820 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#fff" }}>
              Τίτλος
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="π.χ. Συναυλίες"
              disabled={busy || !canEdit}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "#ffffff",
                color: "#000000",
                outline: "none",
                fontSize: 16,
                boxSizing: "border-box",
              }}
            />
          </div>



          {mode === "edit" && groupId ? (
            <GroupShareSection groupId={groupId} groupRole={original?.role ?? null} />
          ) : null}

          <InlineError message={err ?? undefined} />
        </div>
      )}
    </>
  );
}