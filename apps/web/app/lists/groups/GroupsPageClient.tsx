// apps/web/app/lists/groups/GroupsPageClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

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

/**
 * Returns a human‑readable (Greek) label for a group role.  This mirrors
 * the role labels used in list detail pages.  Without this helper the UI
 * shows raw enum values like "OWNER" or "LIST_EDITOR" which are not localized.
 */
function roleLabel(role: "OWNER" | "LIST_EDITOR" | "VIEWER"): string {
  if (role === "OWNER") return "Δημιουργός";
  if (role === "LIST_EDITOR") return "Διαχειριστής";
  return "Χρήστης";
}

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
    const msg =
      (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: (body ?? { items: [] }) as ListGroupsIndexResponse };
}

export default function GroupsPageClient() {
  const { status } = useSession();

  const [rows, setRows] = useState<ListGroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const busy = loading;

  const sorted = useMemo(() => {
    const arr = (rows ?? []).slice();
    arr.sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
    return arr;
  }, [rows]);

  async function reload() {
    setErr(null);
    setAuthRequired(false);
    setLoading(true);

    const r = await apiGetGroups();

    if (!r.ok) {
      setRows([]);
      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία φόρτωσης");
      }
      setLoading(false);
      return;
    }

    setRows(Array.isArray(r.data.items) ? r.data.items : []);
    setLoading(false);
  }

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (status === "unauthenticated") {
      setRows([]);
      setErr(null);
      setAuthRequired(true);
      setLoading(false);
      return;
    }

    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (authRequired) {
    return (
      <>
        <ActionBar
          left={A.backLink({
            href: "/lists",
            title: "Πίσω στις λίστες",
            disabled: busy,
          })}
          right={null}
        />

        <h1 style={{ fontSize: 26, marginBottom: 12 }}>Ομάδες</h1>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 12,
            maxWidth: 720,
            background: "rgba(0,0,0,0.03)",
          }}
        >
          Απαιτείται σύνδεση για προβολή και επεξεργασία ομάδων.
        </div>
      </>
    );
  }

  return (
    <>
      <ActionBar
        left={A.backLink({
          href: "/lists",
          title: "Πίσω στις λίστες",
          disabled: busy,
        })}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {A.newLink({
              href: "/lists/groups/new",
              title: "Νέα ομάδα",
              label: "Νέο",
              disabled: busy,
            })}
            {A.refresh({
              onClick: reload,
              disabled: busy,
              title: "Ανανέωση",
              label: "Ανανέωση",
            })}
          </div>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 12 }}>Ομάδες</h1>

      {err ? (
        <div
          style={{
            marginTop: 12,
            background: "rgba(255,0,0,0.06)",
            border: "1px solid rgba(255,0,0,0.2)",
            padding: 10,
            borderRadius: 10,
            color: "#fff",
            maxWidth: 720,
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Φόρτωση…</div>
        ) : sorted.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Δεν υπάρχουν ομάδες.</div>
        ) : (
          <div
            style={{
              maxWidth: 1100,
              display: "grid",
              gap: 10,

              // ✅ responsive multi-column:
              // - mobile: 1 column
              // - medium screens: 2 columns
              // - large screens: 3 columns (auto-fit will still behave nicely)
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            }}
          >
            {sorted.map((g) => {
              const canEdit = g.role === "OWNER" || g.role === "LIST_EDITOR";

              return (
                <div
                  key={g.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.22)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    minWidth: 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>
                      {g.title}{" "}
                      <span style={{ opacity: 0.75, fontWeight: 700 }}>
                        ({g.listsCount})
                      </span>
                    </div>

                    <div style={{ opacity: 0.7, marginTop: 6, fontSize: 12 }}>
                      Ρόλος: {roleLabel(g.role)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {A.editLink({
                      href: `/lists/groups/${g.id}/edit`,
                      disabled: busy || !canEdit,
                      title: "Επεξεργασία",
                      label: "Επεξεργασία",
                      style: { whiteSpace: "nowrap" },
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}