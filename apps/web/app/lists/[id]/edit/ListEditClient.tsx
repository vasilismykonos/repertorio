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
  items.sort((a: any, b: any) => {
    const aSort = Number(a.sortId) || 0;
    const bSort = Number(b.sortId) || 0;
    if (aSort !== bSort) return bSort - aSort;

    const aId = Number(a.listItemId) || 0;
    const bId = Number(b.listItemId) || 0;
    return bId - aId;
  });
  return items;
}

function itemsForBackendReorder(items: any[]) {
  return (items ?? []).slice().sort((a: any, b: any) => {
    const aSort = Number(a?.sortId) || 0;
    const bSort = Number(b?.sortId) || 0;
    if (aSort !== bSort) return aSort - bSort;

    const aId = Number(a?.listItemId) || 0;
    const bId = Number(b?.listItemId) || 0;
    return aId - bId;
  });
}

function sameNumberArray(a: number[], b: number[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Number(a[i]) !== Number(b[i])) return false;
  }
  return true;
}

function sameNumberSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const aa = [...new Set(a.map(Number))].sort((x, y) => x - y);
  const bb = [...new Set(b.map(Number))].sort((x, y) => x - y);
  if (aa.length !== bb.length) return false;
  return aa.every((value, index) => value === bb[index]);
}

function normalizeListGroupIds(list: any): number[] {
  const source = Array.isArray(list?.groupIds) ? list.groupIds : [];
  const ids = source
    .map((value: any) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  if (!ids.length && list?.groupId != null) {
    const legacyId = Number(list.groupId);
    if (Number.isFinite(legacyId) && legacyId > 0) ids.push(legacyId);
  }

  return [...new Set<number>(ids)];
}

function isDraftItem(it: any): boolean {
  return !!it?.__isDraft || Number(it?.listItemId) < 0;
}

function toPositiveInt(value: any): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function nullableText(value: any): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function nullableSign(value: any): "+" | "-" | null {
  return value === "+" || value === "-" ? value : null;
}

function itemTuneSnapshot(item: any) {
  return {
    selectedTonicity: nullableText(item?.selectedTonicity),
    selectedTonicitySign: nullableSign(item?.selectedTonicitySign),
    selectedSingerTuneId: toPositiveInt(item?.selectedSingerTuneId),
  };
}

function sameItemTuneSelection(a: any, b: any) {
  const av = itemTuneSnapshot(a);
  const bv = itemTuneSnapshot(b);
  return (
    av.selectedTonicity === bv.selectedTonicity &&
    av.selectedTonicitySign === bv.selectedTonicitySign &&
    av.selectedSingerTuneId === bv.selectedSingerTuneId
  );
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
  const [groupIds, setGroupIds] = useState<string[]>(() =>
    normalizeListGroupIds(list).map((id) => String(id)),
  );

  // Για να εμφανιστεί άμεσα το νέο tag στο select, ακόμα κι αν δεν είναι στα props groups.
  const [extraGroupOption, setExtraGroupOption] = useState<ExtraGroupOption>(null);

  // Baseline snapshot (μόνο server items)
  const initialItemsRef = useRef<any[]>(normalizeListItemsForEdit(list));
  const initialExistingIdsRef = useRef<number[]>(
    initialItemsRef.current
      .map((it) => Number(it.listItemId))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
  const initialGroupIdsRef = useRef<number[]>(normalizeListGroupIds(list));

  const [items, setItems] = useState<any[]>(() => initialItemsRef.current);
  const [songsDirtyManual, setSongsDirtyManual] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);

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

      const raw = (g as any).fullTitle || g.title || `Tag #${id}`;
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

  const selectedGroupLabels = useMemo(() => {
    const labels = new Map(groupOptions.map((option) => [option.value, option.label]));
    return groupIds.map((id) => labels.get(id) || `Tag #${id}`).filter(Boolean);
  }, [groupIds, groupOptions]);

  // Όταν γυρίζεις από "Νέο tag", πάρε το id από localStorage και κάνε setGroupId.
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
    setGroupIds((prev) => (prev.includes(value) ? prev : [value, ...prev]));

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
          `Tag #${createdId}`;

        setExtraGroupOption({ value, label: stripTrailingCount(labelRaw) });
      } catch {
        setExtraGroupOption({ value, label: `Tag #${createdId}` });
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
    !sameNumberSet(
      groupIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
      initialGroupIdsRef.current,
    );

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

  useEffect(() => {
    if (!permissionsOpen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPermissionsOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [permissionsOpen]);

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
          selectedTonicity: nullableText(draft?.selectedTonicity),
          selectedTonicitySign: nullableSign(draft?.selectedTonicitySign),
          selectedSingerTuneId: toPositiveInt(draft?.selectedSingerTuneId),
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
      // 1) UPDATE list metadata (title/marked/groupIds) if allowed
      if (metaChangesAllowed) {
        const selectedGroupIds = groupIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0);
        await fetchJson(`/lists/${list.id}?userId=${encodeURIComponent(String(viewerUserId))}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: nextTitle,
            marked: !!marked,
            groupId: selectedGroupIds[0] ?? null,
            groupIds: selectedGroupIds,
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

      // 4) UPDATE tone/singer selection on existing items when changed
      for (const it of items ?? []) {
        if (isDraftItem(it)) continue;

        const listItemId = Number(it.listItemId);
        if (!Number.isFinite(listItemId) || listItemId <= 0) continue;

        const initial = initialItemsRef.current.find(
          (candidate) => Number(candidate?.listItemId) === listItemId,
        );
        if (sameItemTuneSelection(it, initial)) continue;

        await fetchJson(
          `/lists/${list.id}/items/${listItemId}?userId=${encodeURIComponent(String(viewerUserId))}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              selectedTonicity: nullableText(it?.selectedTonicity),
              selectedTonicitySign: nullableSign(it?.selectedTonicitySign),
              selectedSingerTuneId: toPositiveInt(it?.selectedSingerTuneId),
            }),
          },
        );
      }

      // 5) REORDER with ONLY positive ids
      const finalOrderIds: number[] = [];
      for (const it of itemsForBackendReorder(items)) {
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

      // 6) cleanup drafts session
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

  // Προσθήκη tag πάνω από το πεδίο Tag.
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

  function toggleGroup(value: string) {
    if (!canEditListMeta || saving || deleting) return;
    setGroupIds((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

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

  const handleSongsOrderSaved = useCallback((savedItems: any[]) => {
    const orderedIds = (savedItems ?? [])
      .map((it) => Number(it?.listItemId))
      .filter((id) => Number.isFinite(id) && id > 0);

    initialExistingIdsRef.current = orderedIds;

    const previousInitialById = new Map<number, any>(
      initialItemsRef.current
        .map((it) => [Number(it?.listItemId), it] as const)
        .filter(([id]) => Number.isFinite(id) && id > 0),
    );

    initialItemsRef.current = (savedItems ?? []).map((item) => {
      const id = Number(item?.listItemId);
      const previous = previousInitialById.get(id);
      return previous ? { ...previous, sortId: item?.sortId } : item;
    });

    setItems(savedItems ?? []);
  }, []);

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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              aria-pressed={marked}
              onClick={() => setMarked((value) => !value)}
              disabled={!canEditListMeta || saving || deleting}
              title={marked ? "Αφαίρεση από αγαπημένες" : "Προσθήκη στις αγαπημένες"}
              style={{
                minHeight: 42,
                padding: "0 14px",
                borderRadius: 14,
                border: marked ? "1px solid rgba(255,215,120,0.55)" : "1px solid rgba(255,255,255,0.18)",
                background: marked ? "rgba(255,215,120,0.16)" : "rgba(255,255,255,0.05)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                fontWeight: 900,
                cursor: !canEditListMeta || saving || deleting ? "not-allowed" : "pointer",
                opacity: !canEditListMeta || saving || deleting ? 0.58 : 1,
              }}
            >
              <span aria-hidden="true" style={{ color: marked ? "#ffd978" : "rgba(255,255,255,0.72)" }}>
                ★
              </span>
              <span>Αγαπημένη</span>
              <span
                aria-hidden="true"
                style={{
                  minWidth: 34,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: marked ? "rgba(25,135,84,0.32)" : "rgba(255,255,255,0.10)",
                  color: marked ? "#9ff0bf" : "rgba(255,255,255,0.72)",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {marked ? "ON" : "OFF"}
              </span>
            </button>

            <Button
              type="button"
              variant="secondary"
              size="md"
              action="settings"
              title="Άνοιγμα δικαιωμάτων λίστας"
              onClick={() => setPermissionsOpen(true)}
              disabled={deleting}
            >
              Δικαιώματα
            </Button>
          </div>
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
              <label style={labelStyle}>Tag</label>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                action="new"
                title="Προσθήκη tag"
                onClick={onAddGroup}
                disabled={!canEditListMeta || saving || deleting}
              >
                Προσθήκη tag
              </Button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {groupIds.length ? (
                <button
                  type="button"
                  onClick={() => setGroupIds([])}
                  disabled={!canEditListMeta || saving || deleting}
                  style={{
                    minHeight: 34,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#fff",
                    padding: "6px 11px",
                    fontWeight: 800,
                    cursor: !canEditListMeta || saving || deleting ? "default" : "pointer",
                  }}
                >
                  Καθαρισμός tags
                </button>
              ) : null}
              {groupOptions.map((o) => {
                const selected = groupIds.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleGroup(o.value)}
                    disabled={!canEditListMeta || saving || deleting}
                    aria-pressed={selected}
                    style={{
                      minHeight: 34,
                      borderRadius: 999,
                      border: selected ? "1px solid rgba(88,166,255,0.65)" : "1px solid rgba(255,255,255,0.18)",
                      background: selected ? "rgba(88,166,255,0.22)" : "rgba(255,255,255,0.04)",
                      color: "#fff",
                      padding: "6px 11px",
                      fontWeight: 800,
                      cursor: !canEditListMeta || saving || deleting ? "default" : "pointer",
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            {selectedGroupLabels.length ? (
              <div style={{ fontSize: 13, opacity: 0.75, color: "#fff" }}>
                Tags: <strong>{selectedGroupLabels.join(", ")}</strong>
              </div>
            ) : null}
          </div>

          <ListEditSongsClient
            viewerUserId={viewerUserId}
            listId={list.id}
            initialItems={normalizeListItemsForEdit(list)}
            inputStyle={inputStyle}
            onItemsChange={(next) => setItems(next)}
            onDirtyChange={(d) => setSongsDirtyManual(!!d)}
            onOrderSaved={handleSongsOrderSaved}
            initialPickedSongId={initialPickedSongId ?? null}
          />
        </div>
      </div>

      {permissionsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="list-permissions-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPermissionsOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4000,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "min(760px, calc(100vh - 32px))",
              overflow: "hidden",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "#101010",
              boxShadow: "0 28px 80px rgba(0,0,0,0.62)",
              color: "#fff",
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr)",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 id="list-permissions-title" style={{ margin: 0, fontSize: 20, lineHeight: 1.2 }}>
                  Δικαιώματα
                </h2>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.72)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {list.title || `Λίστα #${list.id}`}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPermissionsOpen(false)}
                aria-label="Κλείσιμο"
                title="Κλείσιμο"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: 24,
                  lineHeight: 1,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 16, overflowY: "auto", overflowX: "hidden" }}>
              <ListEditMembersPanel
                listId={list.id}
                viewerUserId={viewerUserId}
                canManageMembers={canManageMembers}
                inputStyle={inputStyle}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
