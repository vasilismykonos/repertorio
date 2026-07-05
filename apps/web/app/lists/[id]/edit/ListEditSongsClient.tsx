// apps/web/app/lists/[id]/edit/ListEditSongsClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Button from "@/app/components/buttons/Button";
import ListItemTonePicker, {
  normalizeTonicitySign,
  type ListItemSingerSuggestion,
  type ListItemToneValue,
} from "@/app/components/ListItemTonePicker";

type ListItemRow = {
  listItemId: number; // existing (>0) OR temp (<0)
  listId: number;
  sortId: number;

  songId: number | null;
  title: string | null;
  songViews?: number | null;
  songOriginalKey?: string | null;
  songOriginalKeySign?: "+" | "-" | null;
  transport?: number;
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
  selectedSingerTuneTitle?: string | null;
  selectedSingerTuneTune?: string | null;

  __isDraft?: boolean;
};

type SortDirection = "asc" | "desc";
type SortMode = "number" | "title" | "popularity";

type PersistedState = {
  items: ListItemRow[];
  nextTempId: number; // negative counter
  sortDirection?: SortDirection;
  sortMode?: SortMode;
};

const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
const DEFAULT_SORT_MODE: SortMode = "number";
const DRAG_SCROLL_EDGE_PX = 92;
const DRAG_SCROLL_MAX_STEP = 28;
const DRAG_SCROLL_MIN_STEP = 5;

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isSortMode(value: unknown): value is SortMode {
  return value === "number" || value === "title" || value === "popularity";
}

function normalizeTopDownSortIds(items: ListItemRow[]) {
  return (items ?? []).map((item, index) => ({
    ...item,
    sortId: index + 1,
  }));
}

function positiveItemIds(items: ListItemRow[]) {
  return (items ?? [])
    .map((item) => Number(item.listItemId))
    .filter((id) => Number.isFinite(id) && Number.isInteger(id) && id > 0);
}

function compareItemsByStableId(direction: SortDirection) {
  const sign = direction === "asc" ? 1 : -1;

  return (a: ListItemRow, b: ListItemRow) => {
    const aId = Number(a.listItemId) || 0;
    const bId = Number(b.listItemId) || 0;
    return (aId - bId) * sign;
  };
}

function compareItemsBySortId(direction: SortDirection) {
  const sign = direction === "asc" ? 1 : -1;
  const compareStableId = compareItemsByStableId(direction);

  return (a: ListItemRow, b: ListItemRow) => {
    const aSort = Number(a.sortId) || 0;
    const bSort = Number(b.sortId) || 0;
    if (aSort !== bSort) return (aSort - bSort) * sign;

    return compareStableId(a, b);
  };
}

function normalizeSortTitle(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function itemPopularity(item: ListItemRow) {
  const n = Number(item.songViews);
  return Number.isFinite(n) ? n : 0;
}

function compareItemsByMode(mode: SortMode, direction: SortDirection) {
  if (mode === "title") {
    const sign = direction === "asc" ? 1 : -1;
    const compareStableId = compareItemsByStableId(direction);

    return (a: ListItemRow, b: ListItemRow) => {
      const byTitle = normalizeSortTitle(a.title).localeCompare(
        normalizeSortTitle(b.title),
        "el",
        { sensitivity: "base", numeric: true },
      );
      if (byTitle !== 0) return byTitle * sign;
      return compareStableId(a, b);
    };
  }

  if (mode === "popularity") {
    const sign = direction === "asc" ? 1 : -1;
    const compareSortId = compareItemsBySortId(direction);

    return (a: ListItemRow, b: ListItemRow) => {
      const byPopularity = itemPopularity(a) - itemPopularity(b);
      if (byPopularity !== 0) return byPopularity * sign;
      return compareSortId(a, b);
    };
  }

  return compareItemsBySortId(direction);
}

function sortItemsByMode(items: ListItemRow[], mode: SortMode, direction: SortDirection) {
  const copy = (items ?? []).slice();
  copy.sort(compareItemsByMode(mode, direction));
  return copy;
}

function sortItemsByDirection(items: ListItemRow[], direction: SortDirection) {
  return sortItemsByMode(items, DEFAULT_SORT_MODE, direction);
}

function normalizeItemsForEdit(items: ListItemRow[]) {
  return sortItemsByDirection(items, DEFAULT_SORT_DIRECTION);
}

function safeReturnTo(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  return null;
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function nullablePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

function toneValueFromItem(item: Partial<ListItemRow> | null | undefined): ListItemToneValue {
  return {
    selectedTonicity: nullableText(item?.selectedTonicity),
    selectedTonicitySign: normalizeTonicitySign(item?.selectedTonicitySign),
    selectedSingerTuneId: nullablePositiveInt(item?.selectedSingerTuneId),
    selectedSingerTuneTitle: nullableText(item?.selectedSingerTuneTitle),
    selectedSingerTuneTune: nullableText(item?.selectedSingerTuneTune),
  };
}

function normalizeSuggestionTitle(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("el");
}

function sameTuneSelection(a: Partial<ListItemRow> | null | undefined, b: Partial<ListItemRow> | null | undefined) {
  const av = toneValueFromItem(a);
  const bv = toneValueFromItem(b);
  return (
    av.selectedTonicity === bv.selectedTonicity &&
    av.selectedTonicitySign === bv.selectedTonicitySign &&
    nullablePositiveInt(a?.selectedSingerTuneId) === nullablePositiveInt(b?.selectedSingerTuneId)
  );
}

type Props = {
  viewerUserId: number;
  listId: number;

  initialItems: ListItemRow[];
  inputStyle: React.CSSProperties;

  onItemsChange: (items: ListItemRow[]) => void;
  onDirtyChange: (dirty: boolean) => void;

  onLocalError?: (message: string | null) => void;
  onOrderSaved?: (items: ListItemRow[]) => void;

  initialPickedSongId?: number | null;
};

// ✅ ίδια λογική με το /lists/new
const LS_RETURN_TO = "repertorio_groups_return_to";
const LS_RETURN_TO_LIST_ID = "repertorio_groups_return_to_list_id";
// Το LS_LAST_CREATED_GROUP_ID θα το γράψει η σελίδα δημιουργίας tag.
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
  onOrderSaved,
  initialPickedSongId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const storageKey = useMemo(() => `repertorio:listEdit:${listId}:items`, [listId]);
  const initialNormalized = useMemo(() => normalizeItemsForEdit(initialItems), [initialItems]);

  // NOTE: hydration-safe: server + client first render MUST match
  const [items, setItems] = useState<ListItemRow[]>(() => initialNormalized);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);
  const [sortMode, setSortMode] = useState<SortMode>(DEFAULT_SORT_MODE);
  const [orderTouched, setOrderTouched] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const [songQ, setSongQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const dragIdRef = useRef<number | null>(null);
  const dragAutoScrollRef = useRef<number | null>(null);
  const dragClientYRef = useRef<number | null>(null);

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
  const initialItemByIdRef = useRef<Map<number, ListItemRow>>(
    new Map(
      initialNormalized
        .map((x) => [Number(x.listItemId), x] as const)
        .filter(([id]) => Number.isFinite(id) && id > 0),
    ),
  );

  const setError = useCallback(
    (msg: string | null) => {
      setErr(msg);
      onLocalError?.(msg);
    },
    [onLocalError],
  );

  const stopDragAutoScroll = useCallback(() => {
    if (typeof window === "undefined") return;
    if (dragAutoScrollRef.current !== null) {
      window.cancelAnimationFrame(dragAutoScrollRef.current);
      dragAutoScrollRef.current = null;
    }
  }, []);

  const scheduleDragAutoScroll = useCallback(
    (clientY: number) => {
      if (typeof window === "undefined") return;
      dragClientYRef.current = clientY;
      if (dragAutoScrollRef.current !== null) return;

      const tick = () => {
        if (dragIdRef.current === null) {
          dragAutoScrollRef.current = null;
          return;
        }

        const y = dragClientYRef.current;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (y === null || viewportHeight <= 0) {
          dragAutoScrollRef.current = null;
          return;
        }

        const distanceTop = y;
        const distanceBottom = viewportHeight - y;
        let step = 0;

        if (distanceTop < DRAG_SCROLL_EDGE_PX) {
          const ratio = Math.max(0, Math.min(1, (DRAG_SCROLL_EDGE_PX - distanceTop) / DRAG_SCROLL_EDGE_PX));
          step = -Math.max(DRAG_SCROLL_MIN_STEP, Math.round(ratio * DRAG_SCROLL_MAX_STEP));
        } else if (distanceBottom < DRAG_SCROLL_EDGE_PX) {
          const ratio = Math.max(0, Math.min(1, (DRAG_SCROLL_EDGE_PX - distanceBottom) / DRAG_SCROLL_EDGE_PX));
          step = Math.max(DRAG_SCROLL_MIN_STEP, Math.round(ratio * DRAG_SCROLL_MAX_STEP));
        }

        if (step === 0) {
          dragAutoScrollRef.current = null;
          return;
        }

        window.scrollBy({ top: step, behavior: "auto" });
        dragAutoScrollRef.current = window.requestAnimationFrame(tick);
      };

      dragAutoScrollRef.current = window.requestAnimationFrame(tick);
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onWheel = (event: WheelEvent) => {
      if (dragIdRef.current === null) return;
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, behavior: "auto" });
    };

    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", onWheel);
      stopDragAutoScroll();
    };
  }, [stopDragAutoScroll]);

  function hasSameNumberArray(a: number[], b: number[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Number(a[i]) !== Number(b[i])) return false;
    }
    return true;
  }

  const dirty = useMemo(() => {
    if (orderTouched) return true;
    if ((items ?? []).some((it) => !!it.__isDraft || Number(it.listItemId) < 0)) return true;

    const currentExistingIds = (items ?? [])
      .map((x) => Number(x.listItemId))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (currentExistingIds.length !== initialExistingIdsRef.current.length) return true;
    if (!hasSameNumberArray(currentExistingIds, initialExistingIdsRef.current)) return true;

    for (const it of items ?? []) {
      const id = Number(it.listItemId);
      if (!Number.isFinite(id) || id <= 0) continue;
      const initial = initialItemByIdRef.current.get(id);
      if (!sameTuneSelection(it, initial)) return true;
    }

    return false;
  }, [items, orderTouched]);

  // notify parent
  useEffect(() => {
    onItemsChange(items);
    onDirtyChange(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dirty]);

  const visibleItems = useMemo(
    () => sortItemsByMode(items, sortMode, sortDirection),
    [items, sortMode, sortDirection],
  );

  const visibleOrderDiffersFromSavedOrder = useMemo(() => {
    const visibleOrderIds = positiveItemIds(visibleItems);
    return !hasSameNumberArray(initialExistingIdsRef.current, visibleOrderIds);
  }, [visibleItems]);

  const restoreFromSession = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedState | null;
      const restored = Array.isArray(parsed?.items) ? parsed!.items : null;
      const hasStoredDirection = isSortDirection((parsed as any)?.sortDirection);
      const restoredDirection = hasStoredDirection
        ? (parsed as any).sortDirection
        : DEFAULT_SORT_DIRECTION;
      const hasStoredMode = isSortMode((parsed as any)?.sortMode);
      const restoredMode = hasStoredMode ? (parsed as any).sortMode : DEFAULT_SORT_MODE;

      // restore counter
      const n = Number((parsed as any)?.nextTempId);
      nextTempIdRef.current = Number.isFinite(n) && n < 0 ? n : -1;

      if (!restored) return;

      // merge: server items (truth for existing) + drafts from storage
      const serverById = new Map<number, ListItemRow>();
      for (const it of initialNormalized) serverById.set(Number(it.listItemId), it);
      const restoredById = new Map<number, ListItemRow>();
      for (const it of restored) restoredById.set(Number(it.listItemId), it);

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
          const saved = restoredById.get(id);
          if (srv) {
            merged.push({
              ...srv,
              selectedTonicity: nullableText(saved?.selectedTonicity) ?? nullableText(srv.selectedTonicity),
              selectedTonicitySign:
                normalizeTonicitySign(saved?.selectedTonicitySign) ??
                normalizeTonicitySign(srv.selectedTonicitySign),
              selectedSingerTuneId:
                nullablePositiveInt(saved?.selectedSingerTuneId) ?? nullablePositiveInt(srv.selectedSingerTuneId),
              selectedSingerTuneTitle:
                nullableText(saved?.selectedSingerTuneTitle) ?? nullableText(srv.selectedSingerTuneTitle),
              selectedSingerTuneTune:
                nullableText(saved?.selectedSingerTuneTune) ?? nullableText(srv.selectedSingerTuneTune),
            });
          }
        } else {
          const d = drafts.find((x) => Number(x.listItemId) === id);
          if (d) merged.push(d);
        }
      }

      // append any server items not present in restored (safety)
      for (const srv of initialNormalized) {
        if (!merged.some((x) => Number(x.listItemId) === Number(srv.listItemId))) merged.push(srv);
      }

      setSortDirection(restoredDirection);
      setSortMode(restoredMode);
      setItems(hasStoredDirection ? merged : sortItemsByDirection(merged, restoredDirection));
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
      const payload: PersistedState = {
        items,
        nextTempId: nextTempIdRef.current,
        sortDirection,
        sortMode,
      };
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [items, sortDirection, sortMode, storageKey]);

  function moveItem(listItemId: number, dir: -1 | 1) {
    const idx = visibleItems.findIndex((x) => Number(x.listItemId) === Number(listItemId));
    if (idx < 0) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= visibleItems.length) return;

    const copy = visibleItems.slice();
    const [a] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, a);

    setSortMode(DEFAULT_SORT_MODE);
    setSortDirection("asc");
    setOrderTouched(true);
    setItems(normalizeTopDownSortIds(copy));
  }

  function applySort(nextMode: SortMode, nextDirection: SortDirection) {
    setError(null);
    setSortMode(nextMode);
    setSortDirection(nextDirection);
  }

  async function saveVisibleOrder() {
    if (savingOrder) return;

    const hasDrafts = (items ?? []).some((item) => Number(item.listItemId) < 0 || item.__isDraft);
    if (hasDrafts) {
      setError("Αποθήκευσε πρώτα τα νέα τραγούδια της λίστας και μετά αποθήκευσε νέα σειρά.");
      return;
    }

    const visibleIds = positiveItemIds(visibleItems);
    if (visibleIds.length !== initialExistingIdsRef.current.length) {
      setError("Αποθήκευσε πρώτα τις προσθήκες/διαγραφές και μετά αποθήκευσε νέα σειρά.");
      return;
    }

    const initialIdSet = new Set(initialExistingIdsRef.current);
    if (visibleIds.some((id) => !initialIdSet.has(id))) {
      setError("Η σειρά περιέχει άγνωστο item. Κάνε αποθήκευση λίστας και δοκίμασε ξανά.");
      return;
    }

    setSavingOrder(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/lists/${listId}/items/reorder?userId=${encodeURIComponent(String(viewerUserId))}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: visibleIds }),
        },
      );

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new Error(bodyText || `Αποτυχία αποθήκευσης σειράς (${res.status})`);
      }

      const savedItems = normalizeTopDownSortIds(visibleItems);
      initialExistingIdsRef.current = positiveItemIds(savedItems);
      setSortMode(DEFAULT_SORT_MODE);
      setSortDirection("asc");
      setOrderTouched(false);
      setItems(savedItems);
      onOrderSaved?.(savedItems);
    } catch (error: any) {
      setError(error?.message || "Αποτυχία αποθήκευσης νέας σειράς.");
    } finally {
      setSavingOrder(false);
    }
  }

  function onDragStart(e: React.DragEvent, listItemId: number) {
    dragIdRef.current = listItemId;
    dragClientYRef.current = null;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(listItemId));
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    scheduleDragAutoScroll(e.clientY);
  }

  function onDrop(targetListItemId: number) {
    const fromId = dragIdRef.current;
    dragIdRef.current = null;
    dragClientYRef.current = null;
    stopDragAutoScroll();
    if (!fromId || fromId === targetListItemId) return;

    const fromIdx = visibleItems.findIndex((x) => Number(x.listItemId) === Number(fromId));
    const toIdx = visibleItems.findIndex((x) => Number(x.listItemId) === Number(targetListItemId));
    if (fromIdx < 0 || toIdx < 0) return;

    const copy = visibleItems.slice();
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);

    setSortMode(DEFAULT_SORT_MODE);
    setSortDirection("asc");
    setOrderTouched(true);
    setItems(normalizeTopDownSortIds(copy));
  }

  function onDragEnd() {
    dragIdRef.current = null;
    dragClientYRef.current = null;
    stopDragAutoScroll();
  }

  function removeItem(listItemId: number) {
    setError(null);
    setItems((prev) => prev.filter((x) => Number(x.listItemId) !== Number(listItemId)));
  }

  function updateItemTune(listItemId: number, nextTune: ListItemToneValue) {
    setError(null);
    setItems((prev) =>
      prev.map((item) =>
        Number(item.listItemId) === Number(listItemId)
          ? {
              ...item,
              selectedTonicity: nextTune.selectedTonicity,
              selectedTonicitySign: nextTune.selectedTonicitySign,
              selectedSingerTuneId: nullablePositiveInt(nextTune.selectedSingerTuneId),
              selectedSingerTuneTitle: nullableText(nextTune.selectedSingerTuneTitle),
              selectedSingerTuneTune: nullableText(nextTune.selectedSingerTuneTune),
            }
          : item,
      ),
    );
  }

  const singerSuggestions = useMemo<ListItemSingerSuggestion[]>(() => {
    const seen = new Set<string>();
    const out: ListItemSingerSuggestion[] = [];

    for (const item of items ?? []) {
      const title = nullableText(item.selectedSingerTuneTitle);
      if (!title) continue;

      const key = normalizeSuggestionTitle(title);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        title,
        tune: nullableText(item.selectedSingerTuneTune) ?? nullableText(item.selectedTonicity),
        singerTuneId: nullablePositiveInt(item.selectedSingerTuneId),
      });
    }

    return out.slice(0, 8);
  }, [items]);

  async function hydrateDraftSongKey(tempId: number, songId: number) {
    try {
      const res = await fetch(`/api/songs/${songId}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;

      const data = await res.json();
      const songOriginalKey = nullableText(data?.originalKey ?? data?.original_key);
      const songOriginalKeySign = normalizeTonicitySign(
        data?.originalKeySign ?? data?.original_key_sign,
      );
      const songViews = Number(data?.views);
      const hasSongViews = Number.isFinite(songViews);
      if (!songOriginalKey && !songOriginalKeySign && !hasSongViews) return;

      setItems((prev) =>
        prev.map((item) =>
          Number(item.listItemId) === Number(tempId)
            ? {
                ...item,
                songViews: item.songViews ?? (hasSongViews ? songViews : null),
                songOriginalKey: item.songOriginalKey ?? songOriginalKey,
                songOriginalKeySign: item.songOriginalKeySign ?? songOriginalKeySign,
              }
            : item,
        ),
      );
    } catch {
      // Draft fallback stays blank when the song detail cannot be loaded.
    }
  }

  function addSongDraft(songId: number, songTitle?: string) {
    setError(null);
    if (!Number.isFinite(songId) || songId <= 0) return;

    const title = String(songTitle ?? "").trim();
    const tempId =
      Number.isFinite(nextTempIdRef.current) && nextTempIdRef.current < 0 ? nextTempIdRef.current : -1;
    nextTempIdRef.current = tempId - 1;

    // IMPORTANT: duplicate check INSIDE setItems to avoid stale state
    setItems((prev) => {
      const exists = (prev ?? []).some((it) => Number(it.songId) === Number(songId));
      if (exists) return prev;

      const maxSortId = (prev ?? []).reduce((max, item) => {
        const n = Number(item.sortId);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0);

      const draft: ListItemRow = {
        listItemId: tempId,
        listId,
        sortId: maxSortId + 1,
        songId,
        title: title || null,
        __isDraft: true,
      };

      return prev.concat([draft]);
    });

    setSongQ("");
    void hydrateDraftSongKey(tempId, songId);
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

  // Προσθήκη tag από εδώ (μόνο navigation + return-to).
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
        {/* Header row: τίτλος αριστερά, προσθήκη tag δεξιά (πάνω από τα inputs αυτού του component). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <strong style={{ color: "#fff", fontSize: 16 }}>Τραγούδια λίστας</strong>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {(
              [
                { mode: "number", label: "Αρίθμηση", title: "Ταξινόμηση με βάση την αρίθμηση της λίστας" },
                { mode: "title", label: "Αλφαβητικά", title: "Ταξινόμηση με βάση τον τίτλο" },
                { mode: "popularity", label: "Δημοτικότητα", title: "Ταξινόμηση με βάση τις προβολές του τραγουδιού" },
              ] as const
            ).map((option) => {
              const active = sortMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => applySort(option.mode, sortDirection)}
                  aria-pressed={active}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: active ? "1px solid #0d6efd" : "1px solid #444",
                    background: active ? "#0d47a1" : "#111",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                  title={option.title}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {(
              [
                { direction: "desc", icon: ArrowDownWideNarrow, title: "Φθίνουσα: μεγαλύτερη τιμή πρώτα" },
                { direction: "asc", icon: ArrowUpNarrowWide, title: "Αύξουσα: μικρότερη τιμή πρώτα" },
              ] as const
            ).map((option) => {
              const active = sortDirection === option.direction;
              const DirectionIcon = option.icon;
              return (
                <button
                  key={option.direction}
                  type="button"
                  onClick={() => applySort(sortMode, option.direction)}
                  aria-pressed={active}
                  aria-label={option.title}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 38,
                    height: 38,
                    padding: 0,
                    borderRadius: 10,
                    border: active ? "1px solid #0d6efd" : "1px solid #444",
                    background: active ? "#0d47a1" : "#111",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                  title={option.title}
                >
                  <DirectionIcon size={18} strokeWidth={2.4} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={saveVisibleOrder}
            disabled={savingOrder || !visibleOrderDiffersFromSavedOrder}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 10,
              border: visibleOrderDiffersFromSavedOrder ? "1px solid #198754" : "1px solid #444",
              background: visibleOrderDiffersFromSavedOrder ? "#0f5132" : "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: savingOrder || !visibleOrderDiffersFromSavedOrder ? "not-allowed" : "pointer",
              opacity: savingOrder || !visibleOrderDiffersFromSavedOrder ? 0.55 : 1,
            }}
            title="Αποθηκεύει ως μόνιμη τη σειρά που βλέπεις τώρα"
          >
            {savingOrder ? "Αποθήκευση..." : "Αποθήκευση νέας σειράς"}
          </button>
        </div>
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

      {visibleItems.length === 0 ? (
        <div style={{ color: "#fff", opacity: 0.85 }}>Η λίστα δεν περιέχει τραγούδια.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {visibleItems.map((it, idx) => {
            const isDraft = !!it.__isDraft || Number(it.listItemId) < 0;
            const titleText = String(it.title ?? "").trim() || (it.songId ? `Song #${it.songId}` : "Song");
            const displayNumber = Number.isFinite(Number(it.sortId)) && Number(it.sortId) > 0 ? Number(it.sortId) : idx + 1;

            return (
              <li
                key={it.listItemId}
                draggable
                onDragStart={(event) => onDragStart(event, Number(it.listItemId))}
                onDragOver={onDragOver}
                onDrop={() => onDrop(Number(it.listItemId))}
                onDragEnd={onDragEnd}
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
                  <div
                    style={{
                      color: "#fff",
                      fontWeight: 700,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      {displayNumber}. {titleText}
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

                    <ListItemTonePicker
                      songId={it.songId}
                      songOriginalKey={it.songOriginalKey}
                      songOriginalKeySign={it.songOriginalKeySign}
                      value={toneValueFromItem(it)}
                      singerSuggestions={singerSuggestions}
                      onChange={(nextTune) => updateItemTune(Number(it.listItemId), nextTune)}
                    />
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
                    disabled={idx === visibleItems.length - 1}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fff",
                      background: "#0b0b0b",
                      color: "#fff",
                      cursor: idx === visibleItems.length - 1 ? "not-allowed" : "pointer",
                      opacity: idx === visibleItems.length - 1 ? 0.5 : 1,
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
