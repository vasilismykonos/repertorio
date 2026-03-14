// apps/web/app/lists/new/ListNewClient.tsx
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button"; // ✅ χρησιμοποιούμε το Button που έδειξες

type ListGroupSummary = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
};

type GroupsProp =
  | ListGroupSummary[]
  | { items?: ListGroupSummary[] }
  | { groups?: ListGroupSummary[] }
  | null
  | undefined
  | unknown;

type Props = {
  viewerUserId: number;
  groups: GroupsProp;
};

const LS_RETURN_TO = "repertorio_groups_return_to";
const LS_LAST_CREATED_GROUP_ID = "repertorio_last_created_group_id";

function stripTrailingCount(label: string): string {
  if (!label) return "";
  return String(label).replace(/\s*\(\d+\)\s*$/, "").trim();
}

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function normalizeGroups(input: GroupsProp): ListGroupSummary[] {
  if (Array.isArray(input)) return input as ListGroupSummary[];

  if (input && typeof input === "object" && Array.isArray((input as any).items)) {
    return (input as any).items as ListGroupSummary[];
  }

  if (input && typeof input === "object" && Array.isArray((input as any).groups)) {
    return (input as any).groups as ListGroupSummary[];
  }

  return [];
}

export default function ListNewClient({ viewerUserId, groups }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [marked, setMarked] = useState(false);
  const [groupId, setGroupId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const safeGroups = useMemo(() => normalizeGroups(groups), [groups]);

  const groupOptions = useMemo(() => {
    const seen = new Set<number>();
    const arr: { value: string; label: string }[] = [];

    for (const g of safeGroups) {
      const id = Number((g as any)?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      const raw = (g as any)?.fullTitle || (g as any)?.title || `Ομάδα #${id}`;
      arr.push({ value: String(id), label: stripTrailingCount(raw) });
    }

    arr.sort((a, b) => a.label.localeCompare(b.label, "el"));
    return arr;
  }, [safeGroups]);

  // ✅ όταν γυρίσουμε από create group
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LS_LAST_CREATED_GROUP_ID) ?? "";
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return;

      setGroupId(String(n));
      window.localStorage.removeItem(LS_LAST_CREATED_GROUP_ID);
    } catch {
      // ignore
    }
  }, []);

  const canSave = !saving && title.trim().length > 0;

  function onCancel() {
    if (saving) return;
    router.push("/lists");
    router.refresh();
  }

  function onAddGroup() {
    if (saving) return;

    try {
      // πού να επιστρέψει μετά το save της ομάδας
      window.localStorage.setItem(LS_RETURN_TO, "/lists/new");
    } catch {
      // ignore
    }

    router.push("/lists/groups/new");
  }

  async function onSave() {
    if (saving) return;

    const nextTitle = title.trim();
    if (!nextTitle) {
      setErr("Ο τίτλος είναι υποχρεωτικός.");
      return;
    }

    setSaving(true);
    setErr(null);

    try {
      const url = `/api/v1/lists?userId=${encodeURIComponent(String(viewerUserId))}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          title: nextTitle,
          marked: !!marked,
          groupId: groupId === "" ? null : Number(groupId),
        }),
      });

      const body = await readJson(res);

      if (!res.ok) {
        const msg =
          (body as any)?.error ||
          (body as any)?.message ||
          `Αποτυχία δημιουργίας (HTTP ${res.status})`;
        throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
      }

      const newId = (body as any)?.id ?? (body as any)?.list?.id;
      const idNum = Number(newId);
      if (!Number.isFinite(idNum) || idNum <= 0) {
        throw new Error("Create: δεν επέστρεψε έγκυρο id από το API.");
      }

      router.push(`/lists/${idNum}/edit`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία δημιουργίας");
    } finally {
      setSaving(false);
    }
  }

  const fieldWrapStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    maxWidth: 520,
    width: "100%",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #bbb",
    background: "#ffffff",
    color: "#000000",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.85)",
    fontWeight: 600,
  };

  return (
    <section style={{ padding: "1rem", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        left={A.backLink({ href: "/lists", title: "Πίσω", disabled: saving })}
        right={
          <>
            {A.cancel({ title: "Άκυρο", disabled: saving, onClick: onCancel })}
            {A.save({
              title: saving ? "Δημιουργία…" : "Δημιουργία",
              disabled: !canSave,
              loading: saving,
              onClick: onSave,
            })}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 12 }}>Νέα λίστα</h1>

      <div
        style={{
          marginTop: 14,
          border: "1px solid #333",
          background: "#111",
          borderRadius: 12,
          padding: 14,
        }}
      >
        {err ? (
          <div
            style={{
              border: "1px solid rgba(255,80,80,0.35)",
              background: "rgba(255,80,80,0.10)",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 12,
              color: "#fff",
            }}
          >
            <strong>Σφάλμα:</strong> {err}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 14 }}>
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Τίτλος</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Τίτλος λίστας…"
              style={inputStyle}
              disabled={saving}
            />
          </div>

          <div style={fieldWrapStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <label style={labelStyle}>Ομάδα</label>

              {/* ✅ ΠΡΟΣΟΧΗ: Button, όχι Link, για να δουλέψει το onClick */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                action="new"
                title="Προσθήκη ομάδας"
                disabled={saving}
                onClick={onAddGroup}
              >
                Προσθήκη
              </Button>
            </div>

            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              style={inputStyle}
              disabled={saving}
            >
              <option value="">Χωρίς ομάδα</option>
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <div style={{ fontSize: 12, opacity: 0.7, color: "#fff" }}>
              Ομάδες διαθέσιμες: {safeGroups.length}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
            <input
              id="marked"
              type="checkbox"
              checked={marked}
              onChange={(e) => setMarked(e.target.checked)}
              style={{ width: 18, height: 18 }}
              disabled={saving}
            />
            <label htmlFor="marked" style={{ color: "#fff", fontWeight: 600 }}>
              Αγαπημένη (★)
            </label>
          </div>

          <div style={{ fontSize: 13, opacity: 0.8, color: "#fff" }}>
            Αφού δημιουργηθεί η λίστα, θα μπορείς να προσθέσεις τραγούδια και να κάνεις reorder.
          </div>
        </div>
      </div>
    </section>
  );
}