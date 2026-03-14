// apps/web/app/lists/[id]/edit/ListEditClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";
import { fetchJson } from "@/lib/api";

import ListEditSongsClient from "./ListEditSongsClient";
import ListEditMembersPanel from "./ListEditMembersPanel";

import type { ListDetailDto, ListGroupSummary } from "./page";

type Props = {
  viewerUserId: number;
  list: ListDetailDto;
  groups: ListGroupSummary[];
  initialPickedSongId?: number | null;
};

function stripTrailingCount(label: string): string {
  if (!label) return "";
  return String(label).replace(/\s*\(\d+\)\s*$/, "").trim();
}

function normalizeListItemsForEdit(list: ListDetailDto) {
  const items = (list.items ?? []).slice();
  items.sort((a: any, b: any) => (Number(a.sortId) || 0) - (Number(b.sortId) || 0));
  return items;
}

function sameNumberArray(a: number[], b: number[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Number(a[i]) !== Number(b[i])) return false;
  }
  return true;
}

function isDraftItem(it: any): boolean {
  return !!it?.__isDraft || Number(it?.listItemId) < 0;
}

function toPositiveInt(value: any): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function safeReturnTo(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  return null;
}

// ✅ ίδια λογική με το /lists/new
const LS_RETURN_TO = "repertorio_groups_return_to";
const LS_RETURN_TO_LIST_ID = "repertorio_groups_return_to_list_id";
const LS_LAST_CREATED_GROUP_ID = "repertorio_last_created_group_id";

type ExtraGroupOption = { value: string; label: string } | null;

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

export default function ListEditClient({ viewerUserId, list, groups, initialPickedSongId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [title, setTitle] = useState<string>(list.title ?? "");
  const [marked, setMarked] = useState<boolean>(!!list.marked);
  const [groupId, setGroupId] = useState<string>(list.groupId === null ? "" : String(list.groupId));

  // ✅ για να εμφανιστεί άμεσα η νέα ομάδα στο select, ακόμα κι αν δεν είναι στα props groups
  const [extraGroupOption, setExtraGroupOption] = useState<ExtraGroupOption>(null);

  // Baseline snapshot (μόνο server items)
  const initialItemsRef = useRef<any[]>(normalizeListItemsForEdit(list));
  const initialExistingIdsRef = useRef<number[]>(
    initialItemsRef.current
      .map((it) => Number(it.listItemId))
      .filter((id) => Number.isFinite(id) && id > 0),
  );

  const [items, setItems] = useState<any[]>(() => initialItemsRef.current);
  const [songsDirtyManual, setSongsDirtyManual] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Μόνο ο OWNER ή ο LIST_EDITOR μπορεί να διαχειρίζεται τα μέλη της λίστας.
  const canManageMembers = list.role === "OWNER" || list.role === "LIST_EDITOR";

  // Determine which parts of the list can be edited based on the viewer's role.
  // Only OWNER or LIST_EDITOR may edit list metadata (title, group, favorite flag).
  const canEditListMeta = list.role === "OWNER" || list.role === "LIST_EDITOR";
  // SONGS_EDITOR may edit songs but not list metadata.  OWNER and LIST_EDITOR can edit songs too.
  const canEditSongs =
    list.role === "OWNER" || list.role === "LIST_EDITOR" || list.role === "SONGS_EDITOR";

  // ---------------------------
  // GROUP OPTIONS
  // ---------------------------
  const baseGroupOptions = useMemo(() => {
    const seen = new Set<number>();
    const arr: { value: string; label: string }[] = [];

    for (const g of groups ?? []) {
      const id = Number(g.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      const raw = (g as any).fullTitle || g.title || `Ομάδα #${id}`;
      arr.push({ value: String(id), label: stripTrailingCount(raw) });
    }

    arr.sort((a, b) => a.label.localeCompare(b.label, "el"));
    return arr;
  }, [groups]);

  const groupOptions = useMemo(() => {
    if (!extraGroupOption) return baseGroupOptions;

    // αν υπάρχει ήδη, μην διπλοβάλεις
    const exists = baseGroupOptions.some((o) => o.value === extraGroupOption.value);
    const merged = exists ? baseGroupOptions : [extraGroupOption, ...baseGroupOptions];

    merged.sort((a, b) => a.label.localeCompare(b.label, "el"));
    return merged;
  }, [baseGroupOptions, extraGroupOption]);

  // ✅ όταν γυρίζεις από "Νέα ομάδα", πάρε το id από localStorage και κάνε setGroupId
  useEffect(() => {
    if (typeof window === "undefined") return;

    let raw = "";
    try {
      raw = window.localStorage.getItem(LS_LAST_CREATED_GROUP_ID) ?? "";
    } catch {
      raw = "";
    }

    const createdId = toPositiveInt(raw);
    if (!createdId) return;

    // consume once
    try {
      window.localStorage.removeItem(LS_LAST_CREATED_GROUP_ID);
    } catch {
      // ignore
    }

    const value = String(createdId);

    // 1) set value (ώστε να "γυρίσει" η φόρμα)
    setGroupId(value);

    // 2) αν δεν υπάρχει στα options, φέρε τίτλο από API και πρόσθεσε προσωρινό option
    const alreadyInOptions = baseGroupOptions.some((o) => o.value === value);
    if (alreadyInOptions) return;

    (async () => {
      try {
        const res = await fetch("/api/lists/groups", { cache: "no-store" });
        const body = await readJson(res);
        if (!res.ok) return;

        const items = Array.isArray((body as any)?.items) ? (body as any).items : [];
        const found = items.find((x: any) => Number(x?.id) === createdId);

        const labelRaw =
          (found?.fullTitle as string | null) ||
          (found?.title as string | null) ||
          `Ομάδα #${createdId}`;

        setExtraGroupOption({ value, label: stripTrailingCount(labelRaw) });
      } catch {
        setExtraGroupOption({ value, label: `Ομάδα #${createdId}` });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseGroupOptions]);

  // ---------------------------
  // DIRTY / SAVE LOGIC
  // ---------------------------
  // Track whether list metadata has changed.  We separate this from song
  // ordering changes so that users without metadata edit rights (SONGS_EDITOR)
  // cannot save unrelated metadata updates.
  const metaHasChanges =
    title.trim() !== (list.title ?? "").trim() ||
    marked !== !!list.marked ||
    (groupId === "" ? null : Number(groupId)) !== (list.groupId ?? null);

  const songsDirtyDerived = useMemo(() => {
    const cur = items ?? [];
    if (cur.some((it) => isDraftItem(it))) return true;

    const currentExistingIds = cur
      .map((it) => Number(it.listItemId))
      .filter((id) => Number.isFinite(id) && id > 0);

    return !sameNumberArray(currentExistingIds, initialExistingIdsRef.current);
  }, [items]);

  const songsDirty = !!songsDirtyManual || songsDirtyDerived;

  // Determine whether there are any permissible changes to save.  Metadata
  // changes require canEditListMeta; song changes require canEditSongs.
  const metaChangesAllowed = canEditListMeta && metaHasChanges;
  const songChangesAllowed = canEditSongs && songsDirty;
  const canSave = !saving && !deleting && (metaChangesAllowed || songChangesAllowed);

  // Only the OWNER may delete a list.
  const canDelete = !saving && !deleting && list.role === "OWNER";

  function sessionKeyForList(listId: number) {
    return `repertorio:listEdit:${listId}:items`;
  }

  async function createDraftItemOnServer(draft: any): Promise<number> {
    const songId = toPositiveInt(draft?.songId);
    if (!songId) throw new Error("Draft item has invalid songId");

    const res = await fetchJson(
      `/lists/${list.id}/items?userId=${encodeURIComponent(String(viewerUserId))}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songId,
          title: typeof draft?.title === "string" ? draft.title : undefined,
        }),
      },
    );

    const createdId =
      toPositiveInt((res as any)?.listItemId) ??
      toPositiveInt((res as any)?.id) ??
      toPositiveInt((res as any)?.item?.id) ??
      toPositiveInt((res as any)?.item?.listItemId);

    if (!createdId) throw new Error("Add item: server did not return a valid listItemId");
    return createdId;
  }

  async function onSave() {
    if (saving || deleting) return;

    const nextTitle = title.trim();
    if (!nextTitle) {
      setErr("Ο τίτλος είναι υποχρεωτικός.");
      return;
    }

    setSaving(true);
    setErr(null);

    try {
      // 1) UPDATE list metadata (title/marked/groupId) if allowed
      if (metaChangesAllowed) {
        await fetchJson(`/lists/${list.id}?userId=${encodeURIComponent(String(viewerUserId))}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: nextTitle,
            marked: !!marked,
            groupId: groupId === "" ? null : Number(groupId),
          }),
        });
      }

      // If there are no song changes to persist, finish here.
      if (!songChangesAllowed) {
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.removeItem(sessionKeyForList(list.id));
          } catch {}
        }
        router.push(`/lists/${list.id}`);
        router.refresh();
        return;
      }

      // 2) DELETE removed existing items
      const currentExistingIds = (items ?? [])
        .filter((it) => !isDraftItem(it))
        .map((it) => Number(it.listItemId))
        .filter((id) => Number.isFinite(id) && id > 0);

      const removedExistingIds = initialExistingIdsRef.current.filter((id) => !currentExistingIds.includes(id));

      for (const listItemId of removedExistingIds) {
        await fetchJson(
          `/lists/${list.id}/items/${listItemId}?userId=${encodeURIComponent(String(viewerUserId))}`,
          { method: "DELETE" },
        );
      }

      // 3) CREATE drafts and map tempId -> realId
      const tempToReal = new Map<number, number>();
      for (const it of items ?? []) {
        if (!isDraftItem(it)) continue;

        const tempId = Number(it.listItemId);
        if (!Number.isFinite(tempId) || tempId >= 0) continue;
        if (tempToReal.has(tempId)) continue;

        const realId = await createDraftItemOnServer(it);
        tempToReal.set(tempId, realId);
      }

      // 4) REORDER with ONLY positive ids
      const finalOrderIds: number[] = [];
      for (const it of items ?? []) {
        const id = Number(it.listItemId);

        if (Number.isFinite(id) && id > 0) {
          finalOrderIds.push(id);
          continue;
        }

        const mapped = tempToReal.get(id);
        if (mapped) finalOrderIds.push(mapped);
      }

      const cleaned = finalOrderIds.filter((x) => Number.isFinite(x) && Number.isInteger(x) && x > 0);

      await fetchJson(`/lists/${list.id}/items/reorder?userId=${encodeURIComponent(String(viewerUserId))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: cleaned }),
      });

      // 5) cleanup drafts session
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(sessionKeyForList(list.id));
        } catch {}
      }

      router.push(`/lists/${list.id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canDelete) return;

    const ok = window.confirm(
      `Να διαγραφεί οριστικά η λίστα "${title.trim() || list.title || `#${list.id}`}" ;\n\n` +
        "Θα διαγραφούν και τα τραγούδια της λίστας (items).",
    );
    if (!ok) return;

    setDeleting(true);
    setErr(null);

    try {
      await fetchJson(`/lists/${list.id}?userId=${encodeURIComponent(String(viewerUserId))}`, {
        method: "DELETE",
      });

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(sessionKeyForList(list.id));
        } catch {}
      }

      router.push("/lists");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία διαγραφής");
    } finally {
      setDeleting(false);
    }
  }

  // ✅ ΠΡΟΣΘΗΚΗ ΟΜΑΔΑΣ: πάνω από το Ομάδα (δεξιά)
  const onAddGroup = useCallback(() => {
    try {
      const returnToRel =
        safeReturnTo(`${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`) || pathname;

      window.localStorage.setItem(LS_RETURN_TO, returnToRel);
      window.localStorage.setItem(LS_RETURN_TO_LIST_ID, String(list.id));
      window.localStorage.removeItem(LS_LAST_CREATED_GROUP_ID);
    } catch {
      // ignore
    }

    router.push("/lists/groups/new");
  }, [pathname, searchParams, router, list.id]);

  const fieldWrapStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    maxWidth: 520,
    width: "100%",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    maxWidth: "100%",
    minWidth: 0,
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

            {A.del({
              label: deleting ? "Διαγραφή…" : "Διαγραφή",
              onClick: onDelete,
              disabled: !canDelete,
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
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Τίτλος</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Τίτλος λίστας…"
              style={inputStyle}
              disabled={!canEditListMeta || saving || deleting}
            />
          </div>

          <div style={fieldWrapStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <label style={labelStyle}>Ομάδα</label>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                action="new"
                title="Προσθήκη ομάδας"
                onClick={onAddGroup}
                disabled={!canEditListMeta || saving || deleting}
              >
                Προσθήκη ομάδας
              </Button>
            </div>

            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              style={inputStyle}
              disabled={!canEditListMeta || saving || deleting}
            >
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

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
            <input
              id="marked"
              type="checkbox"
              checked={marked}
              onChange={(e) => setMarked(e.target.checked)}
              style={{ width: 18, height: 18 }}
              disabled={!canEditListMeta || saving || deleting}
            />
            <label htmlFor="marked" style={{ color: "#fff", fontWeight: 600 }}>
              Αγαπημένη (★)
            </label>
          </div>

          {/* ✅ “Κοινή χρήση” σε ξεχωριστό αρχείο */}
          <ListEditMembersPanel
            listId={list.id}
            viewerUserId={viewerUserId}
            canManageMembers={canManageMembers}
            inputStyle={inputStyle}
          />

          <ListEditSongsClient
            viewerUserId={viewerUserId}
            listId={list.id}
            initialItems={normalizeListItemsForEdit(list)}
            inputStyle={inputStyle}
            onItemsChange={(next) => setItems(next)}
            onDirtyChange={(d) => setSongsDirtyManual(!!d)}
            initialPickedSongId={initialPickedSongId ?? null}
          />
        </div>
      </div>
    </section>
  );
}