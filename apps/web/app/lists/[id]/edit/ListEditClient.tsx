// apps/web/app/lists/[id]/edit/ListEditClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import ListEditSongsClient from "./ListEditSongsClient";

import type { ListDetailDto, ListGroupSummary } from "./page";

type Props = {
  viewerUserId: number;
  list: ListDetailDto;
  groups: ListGroupSummary[];
  initialPickedSongId?: number | null; // ✅ from page.tsx (return from /songs)
};

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

/** Reorder endpoint: όπως το είχες */
function buildReorderUrl(listId: number, userId: number) {
  return `/lists/${listId}/items/reorder?userId=${encodeURIComponent(String(userId))}`;
}

function normalizeListItemsForEdit(list: ListDetailDto) {
  const items = (list.items ?? []).slice();
  items.sort((a: any, b: any) => (Number(a.sortId) || 0) - (Number(b.sortId) || 0));
  return items;
}

export default function ListEditClient({ viewerUserId, list, groups, initialPickedSongId }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState<string>(list.title ?? "");
  const [marked, setMarked] = useState<boolean>(!!list.marked);
  const [groupId, setGroupId] = useState<string>(list.groupId === null ? "" : String(list.groupId));

  // items coming from child
  const [items, setItems] = useState<any[]>(() => normalizeListItemsForEdit(list));
  const [songsDirty, setSongsDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const groupOptions = useMemo(() => {
    const seen = new Set<number>();
    const arr: { value: string; label: string }[] = [];

    for (const g of groups ?? []) {
      const id = Number(g.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      const raw = g.fullTitle || g.title || `Ομάδα #${id}`;
      arr.push({ value: String(id), label: stripTrailingCount(raw) });
    }

    arr.sort((a, b) => a.label.localeCompare(b.label, "el"));
    return arr;
  }, [groups]);

  const hasChanges =
    title.trim() !== (list.title ?? "").trim() ||
    marked !== !!list.marked ||
    (groupId === "" ? null : Number(groupId)) !== (list.groupId ?? null);

  const canSave = !saving && (hasChanges || songsDirty);

  function buildNewSortPayload() {
    return { order: items.map((it) => Number(it.listItemId)) };
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
      // 1) PATCH list fields
      if (hasChanges) {
        const res = await fetch(`/lists/${list.id}?userId=${viewerUserId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: nextTitle,
            marked: !!marked,
            groupId: groupId === "" ? null : Number(groupId),
          }),
        });

        const data = await readJson(res);
        if (!res.ok) {
          const msg =
            data && typeof data === "object" && ("error" in data || "message" in data)
              ? String((data as any).error || (data as any).message)
              : `HTTP ${res.status}`;
          throw new Error(msg);
        }
      }

      // 2) reorder items (αν άλλαξε)
      if (songsDirty) {
        const reorderRes = await fetch(buildReorderUrl(list.id, viewerUserId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildNewSortPayload()),
        });

        const reorderData = await readJson(reorderRes);
        if (!reorderRes.ok) {
          const msg =
            reorderData && typeof reorderData === "object" && ("error" in reorderData || "message" in reorderData)
              ? String((reorderData as any).error || (reorderData as any).message)
              : `HTTP ${reorderRes.status}`;
          throw new Error(`Reorder: ${msg}`);
        }
      }

      router.push(`/lists/${list.id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  }

  // styles (ΜΟΝΟ πεδία + maxwidth όπως ζήτησες)
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
  };

  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.85)",
    fontWeight: 600,
  };

  return (
    <section style={{ padding: "1rem", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        title={`Επεξεργασία: ${list.title || `Λίστα #${list.id}`}`}
        left={A.backLink({ href: `/lists/${list.id}`, label: "Πίσω" })}
        right={
          <>
            {A.link({
              href: `/lists/${list.id}`,
              label: "Άκυρο",
              action: "cancel",
              variant: "secondary",
            })}
            {A.save({
              label: saving ? "Αποθήκευση…" : "Αποθήκευση",
              onClick: onSave,
              disabled: !canSave,
            })}
          </>
        }
      />

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
          {/* Title */}
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Τίτλος</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Τίτλος λίστας…"
              style={inputStyle}
            />
          </div>

          {/* Group */}
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Ομάδα</label>

            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={inputStyle}>
              <option value="">Χωρίς ομάδα</option>
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <div style={{ fontSize: 13, opacity: 0.75, color: "#fff" }}>
              Τρέχουσα: <strong>{list.groupTitle ? stripTrailingCount(list.groupTitle) : "Χωρίς ομάδα"}</strong>
            </div>
          </div>

          {/* Marked */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
            <input
              id="marked"
              type="checkbox"
              checked={marked}
              onChange={(e) => setMarked(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="marked" style={{ color: "#fff", fontWeight: 600 }}>
              Αγαπημένη (★)
            </label>
          </div>

          {/* Songs in separate file */}
          <ListEditSongsClient
            viewerUserId={viewerUserId}
            listId={list.id}
            initialItems={normalizeListItemsForEdit(list)}
            inputStyle={inputStyle}
            onItemsChange={(next) => setItems(next)}
            onDirtyChange={(d) => setSongsDirty(d)}
            initialPickedSongId={initialPickedSongId ?? null}
          />
        </div>
      </div>
    </section>
  );
}
