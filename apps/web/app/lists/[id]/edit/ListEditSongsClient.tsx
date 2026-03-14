// apps/web/app/lists/[id]/edit/ListEditSongsClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Button from "@/app/components/buttons/Button";

type ListItemRow = {
  listItemId: number; // existing (>0) OR temp (<0)
  listId: number;
  sortId: number;

  songId: number | null;
  title: string | null;

  __isDraft?: boolean;
};

type PersistedState = {
  items: ListItemRow[];
  nextTempId: number; // negative counter
};

function normalizeItemsForEdit(items: ListItemRow[]) {
  const copy = (items ?? []).slice();
  copy.sort((a, b) => (Number(a.sortId) || 0) - (Number(b.sortId) || 0));
  return copy;
}

function safeReturnTo(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  return null;
}

type Props = {
  viewerUserId: number;
  listId: number;

  initialItems: ListItemRow[];
  inputStyle: React.CSSProperties;

  onItemsChange: (items: ListItemRow[]) => void;
  onDirtyChange: (dirty: boolean) => void;

  onLocalError?: (message: string | null) => void;

  initialPickedSongId?: number | null;
};

// ✅ ίδια λογική με το /lists/new
const LS_RETURN_TO = "repertorio_groups_return_to";
const LS_RETURN_TO_LIST_ID = "repertorio_groups_return_to_list_id";
// το LS_LAST_CREATED_GROUP_ID θα το γράψει η σελίδα δημιουργίας ομάδας
// και θα το διαβάσει ο parent (ListEditClient) που έχει το group select.
const LS_LAST_CREATED_GROUP_ID = "repertorio_last_created_group_id";

export default function ListEditSongsClient({
  viewerUserId,
  listId,
  initialItems,
  inputStyle,
  onItemsChange,
  onDirtyChange,
  onLocalError,
  initialPickedSongId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const storageKey = useMemo(() => `repertorio:listEdit:${listId}:items`, [listId]);
  const initialNormalized = useMemo(() => normalizeItemsForEdit(initialItems), [initialItems]);

  // NOTE: hydration-safe: server + client first render MUST match
  const [items, setItems] = useState<ListItemRow[]>(() => initialNormalized);

  const [songQ, setSongQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const dragIdRef = useRef<number | null>(null);

  // prevent double add in strict mode
  const pickedProcessedRef = useRef<Set<number>>(new Set());

  // temp ids for draft items (must be unique negative ints)
  const nextTempIdRef = useRef<number>(-1);

  // gate persistence until after restore to avoid overwriting
  const didMountRef = useRef(false);
  const restoredOnceRef = useRef(false);

  const initialExistingIdsRef = useRef<number[]>(
    initialNormalized
      .map((x) => Number(x.listItemId))
      .filter((id) => Number.isFinite(id) && id > 0),
  );

  const setError = useCallback(
    (msg: string | null) => {
      setErr(msg);
      onLocalError?.(msg);
    },
    [onLocalError],
  );

  function hasSameNumberArray(a: number[], b: number[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Number(a[i]) !== Number(b[i])) return false;
    }
    return true;
  }

  const dirty = useMemo(() => {
    if ((items ?? []).some((it) => !!it.__isDraft || Number(it.listItemId) < 0)) return true;

    const currentExistingIds = (items ?? [])
      .map((x) => Number(x.listItemId))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (currentExistingIds.length !== initialExistingIdsRef.current.length) return true;
    if (!hasSameNumberArray(currentExistingIds, initialExistingIdsRef.current)) return true;

    return false;
  }, [items]);

  // notify parent
  useEffect(() => {
    onItemsChange(items);
    onDirtyChange(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dirty]);

  const restoreFromSession = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedState | null;
      const restored = Array.isArray(parsed?.items) ? parsed!.items : null;

      // restore counter
      const n = Number((parsed as any)?.nextTempId);
      nextTempIdRef.current = Number.isFinite(n) && n < 0 ? n : -1;

      if (!restored) return;

      // merge: server items (truth for existing) + drafts from storage
      const serverById = new Map<number, ListItemRow>();
      for (const it of initialNormalized) serverById.set(Number(it.listItemId), it);

      const drafts = restored
        .filter((x) => Number(x.listItemId) < 0 || x.__isDraft)
        .map((d) => ({
          ...d,
          listId,
          __isDraft: true,
          listItemId: Number(d.listItemId) < 0 ? Number(d.listItemId) : -1,
        }));

      const restoredOrder = restored.map((x) => Number(x.listItemId));

      const merged: ListItemRow[] = [];
      for (const id of restoredOrder) {
        if (id > 0) {
          const srv = serverById.get(id);
          if (srv) merged.push(srv);
        } else {
          const d = drafts.find((x) => Number(x.listItemId) === id);
          if (d) merged.push(d);
        }
      }

      // append any server items not present in restored (safety)
      for (const srv of initialNormalized) {
        if (!merged.some((x) => Number(x.listItemId) === Number(srv.listItemId))) merged.push(srv);
      }

      // normalize sortId sequentially
      const normalized = merged.map((x, i) => ({ ...x, sortId: i + 1 }));

      setItems(normalized);
    } catch {
      // ignore parse/storage errors
    }
  }, [initialNormalized, listId, storageKey]);

  // hydration-safe restore: only after mount
  useEffect(() => {
    didMountRef.current = true;

    if (!restoredOnceRef.current) {
      restoredOnceRef.current = true;
      restoreFromSession();
    }

    return () => {
      didMountRef.current = false;
    };
  }, [restoreFromSession]);

  // persist to sessionStorage (ONLY after first mount+restore)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!didMountRef.current) return;
    if (!restoredOnceRef.current) return;

    try {
      const payload: PersistedState = { items, nextTempId: nextTempIdRef.current };
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [items, storageKey]);

  function moveItem(listItemId: number, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((x) => Number(x.listItemId) === Number(listItemId));
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;

      const copy = prev.slice();
      const [a] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, a);

      return copy.map((x, i) => ({ ...x, sortId: i + 1 }));
    });
  }

  function onDragStart(listItemId: number) {
    dragIdRef.current = listItemId;
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDrop(targetListItemId: number) {
    const fromId = dragIdRef.current;
    dragIdRef.current = null;
    if (!fromId || fromId === targetListItemId) return;

    setItems((prev) => {
      const fromIdx = prev.findIndex((x) => Number(x.listItemId) === Number(fromId));
      const toIdx = prev.findIndex((x) => Number(x.listItemId) === Number(targetListItemId));
      if (fromIdx < 0 || toIdx < 0) return prev;

      const copy = prev.slice();
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);

      return copy.map((x, i) => ({ ...x, sortId: i + 1 }));
    });
  }

  function removeItem(listItemId: number) {
    setError(null);
    setItems((prev) =>
      prev
        .filter((x) => Number(x.listItemId) !== Number(listItemId))
        .map((x, i) => ({ ...x, sortId: i + 1 })),
    );
  }

  function addSongDraft(songId: number, songTitle?: string) {
    setError(null);
    if (!Number.isFinite(songId) || songId <= 0) return;

    const title = String(songTitle ?? "").trim();

    // IMPORTANT: duplicate check INSIDE setItems to avoid stale state
    setItems((prev) => {
      const exists = (prev ?? []).some((it) => Number(it.songId) === Number(songId));
      if (exists) return prev;

      const tempId =
        Number.isFinite(nextTempIdRef.current) && nextTempIdRef.current < 0 ? nextTempIdRef.current : -1;

      nextTempIdRef.current = tempId - 1;

      const draft: ListItemRow = {
        listItemId: tempId,
        listId,
        sortId: (prev?.length ?? 0) + 1,
        songId,
        title: title || null,
        __isDraft: true,
      };

      return prev.concat([draft]).map((x, i) => ({ ...x, sortId: i + 1 }));
    });

    setSongQ("");
  }

  // ✅ return from songs picker
  useEffect(() => {
    const pickedFromUrl = searchParams?.get("pickedSongId");
    const pickedTitleFromUrl = searchParams?.get("pickedSongTitle");
    const n = pickedFromUrl ? Number(pickedFromUrl) : NaN;

    if (!Number.isFinite(n) || n <= 0) return;
    if (pickedProcessedRef.current.has(n)) return;
    pickedProcessedRef.current.add(n);

    addSongDraft(n, pickedTitleFromUrl || undefined);

    // cleanup url
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.delete("pickedSongId");
    sp.delete("pickedSongTitle");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  // optional initial picked
  useEffect(() => {
    const n = initialPickedSongId ?? null;
    if (!n || !Number.isFinite(n) || n <= 0) return;
    if (pickedProcessedRef.current.has(n)) return;
    pickedProcessedRef.current.add(n);

    addSongDraft(n);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPickedSongId]);

  function goToGlobalSongsSearch() {
    const q = songQ.trim();
    if (q.length < 1) {
      setError("Γράψε κάτι για αναζήτηση.");
      return;
    }
    setError(null);

    const returnToRel =
      safeReturnTo(`${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`) || pathname;

    const url =
      `/songs` +
      `?search_term=${encodeURIComponent(q)}` +
      `&return_to=${encodeURIComponent(returnToRel)}` +
      `&mode=pick` +
      `&listId=${encodeURIComponent(String(listId))}`;

    window.location.href = url;
  }

  // ✅ ΝΕΟ: προσθήκη ομάδας από εδώ (μόνο navigation + return-to)
  function onAddGroup() {
    try {
      const returnToRel =
        safeReturnTo(`${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`) || pathname;

      window.localStorage.setItem(LS_RETURN_TO, returnToRel);
      window.localStorage.setItem(LS_RETURN_TO_LIST_ID, String(listId));

      // reset last created (προαιρετικά, για να μην "πιάσει" παλιό)
      window.localStorage.removeItem(LS_LAST_CREATED_GROUP_ID);
    } catch {
      // ignore
    }

    router.push("/lists/groups/new");
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Header row: τίτλος αριστερά, προσθήκη ομάδας δεξιά (πάνω από τα inputs αυτού του component) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        
      </div>

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

      <div
        style={{
          border: "1px solid #333",
          borderRadius: 12,
          padding: 12,
          background: "#0b0b0b",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <label style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>Προσθήκη τραγουδιού</label>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={songQ}
              onChange={(e) => setSongQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  goToGlobalSongsSearch();
                }
              }}
              placeholder="Γράψε τίτλο…"
              style={inputStyle}
            />

            <Button
              type="button"
              variant="secondary"
              size="md"
              action="search"
              title="Αναζήτηση στη σελίδα /songs"
              onClick={goToGlobalSongsSearch}
            >
              Αναζήτηση
            </Button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ color: "#fff", opacity: 0.85 }}>Η λίστα δεν περιέχει τραγούδια.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {items.map((it, idx) => {
            const isDraft = !!it.__isDraft || Number(it.listItemId) < 0;
            const titleText = String(it.title ?? "").trim() || (it.songId ? `Song #${it.songId}` : "Song");

            return (
              <li
                key={it.listItemId}
                draggable
                onDragStart={() => onDragStart(Number(it.listItemId))}
                onDragOver={onDragOver}
                onDrop={() => onDrop(Number(it.listItemId))}
                style={{
                  border: "1px solid #333",
                  background: "#111",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
                title="Drag & drop για αλλαγή σειράς (desktop)"
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid #fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    opacity: 0.9,
                    flex: "0 0 auto",
                    cursor: "grab",
                  }}
                  aria-hidden
                >
                  ☰
                </div>

                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ color: "#fff", fontWeight: 700, display: "flex", gap: 10, alignItems: "center" }}>
                    <span>
                      {idx + 1}. {titleText}
                    </span>

                    {isDraft ? (
                      <span
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.35)",
                          color: "rgba(255,255,255,0.85)",
                          opacity: 0.9,
                        }}
                        title="Δεν έχει αποθηκευτεί ακόμη"
                      >
                        ✅ΝΕΟ
                      </span>
                    ) : null}
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }} />
                </div>

                <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                  <button
                    type="button"
                    onClick={() => moveItem(Number(it.listItemId), -1)}
                    disabled={idx === 0}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fff",
                      background: "#0b0b0b",
                      color: "#fff",
                      cursor: idx === 0 ? "not-allowed" : "pointer",
                      opacity: idx === 0 ? 0.5 : 1,
                    }}
                    title="Πάνω"
                  >
                    ↑
                  </button>

                  <button
                    type="button"
                    onClick={() => moveItem(Number(it.listItemId), +1)}
                    disabled={idx === items.length - 1}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fff",
                      background: "#0b0b0b",
                      color: "#fff",
                      cursor: idx === items.length - 1 ? "not-allowed" : "pointer",
                      opacity: idx === items.length - 1 ? 0.5 : 1,
                    }}
                    title="Κάτω"
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    onClick={() => removeItem(Number(it.listItemId))}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fff",
                      background: "#ec1515",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                    title="Αφαίρεση"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}