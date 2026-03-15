"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Info,
  Music,
  Mic,
  Guitar,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  PlayCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import ActionBar from "../../components/ActionBar";
import { A } from "../../components/buttons";
import Button from "../../components/buttons/Button";

import SongChordsClient from "./SongChordsClient";
import SongInfoToggle from "./SongInfoToggle";
import SongSingerTunesClient from "./SongSingerTunesClient";
import SongScoresPanel from "./SongScoresPanel";
import SongAssetsPanel from "./SongAssetsPanel";

import type { Step } from "react-joyride";
import type { SongDetail } from "./page";

// ✅ IMPORTANT: no SSR for Joyride (fix hydration)
const GuidedTour = dynamic(() => import("../../components/GuidedTour"), {
  ssr: false,
});

type PanelsOpen = {
  info: boolean;
  singerTunes: boolean;
  chords: boolean;
  scores: boolean;
  assets: boolean;
};

type RedirectDefault = "TITLE" | "CHORDS" | "LYRICS" | "SCORE" | "ASSETS";

type Props = {
  song: SongDetail;
  canEdit: boolean;

  finalLyrics: string;

  // κρατιέται για συμβατότητα με caller (δεν χρησιμοποιείται εδώ)
  scoreFileUrl: string;

  schemaNode: React.ReactNode;

  defaultPanelsOpen?: Partial<PanelsOpen>;
  redirectDefault?: RedirectDefault;

  youtubeUrl: string;
};

type SongListOption = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
  itemsCount: number;
  name?: string;
  listTitle?: string;
  list_title?: string;
};

type ListsIndexResponse = {
  items: SongListOption[];
  total: number;
  page: number;
  pageSize: number;
};

type AddSongToListResponse = {
  listItemId: number;
  listId: number;
  sortId: number;
  songId: number | null;
  title: string | null;
};

const HEADER_OFFSET_PX = 0;

// Draggable Room button settings
const ROOM_POS_STORAGE_KEY = "repertorio_room_button_pos_v1";
const ROOM_MARGIN = 16;
const DRAG_CLICK_THRESHOLD_PX = 6;

// Tour key
const TOUR_STORAGE_KEY = "tour_song_page_v1";

// Lyrics zoom settings (ALL devices)
const LYRICS_SCALE_STORAGE_KEY = "repertorio_lyrics_scale_v1";
const LYRICS_BASE_FONT_SIZE = 16; // px
const LYRICS_SCALE_MIN = 0.75;
const LYRICS_SCALE_MAX = 2.2;

function scrollToId(id: string) {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function computeInitialPanels(
  hasChords: boolean,
  hasScores: boolean,
  hasAssets: boolean,
  defaults?: Partial<PanelsOpen>,
): PanelsOpen {
  return {
    info: defaults?.info ?? true,
    singerTunes: defaults?.singerTunes ?? true,
    chords: defaults?.chords ?? hasChords,
    // ✅ Νέος τρόπος: ανοίγει default μόνο αν υπάρχουν SCORE assets (εκτός αν υπάρχει override)
    scores: defaults?.scores ?? hasScores,
    // ✅ “Υλικό” default open μόνο αν έχει assets (εκτός αν override)
    assets: defaults?.assets ?? false,
  };
}

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function clampScale(x: number) {
  return Math.min(LYRICS_SCALE_MAX, Math.max(LYRICS_SCALE_MIN, x));
}

function distance2(a: Touch, b: Touch) {
  const dx = b.clientX - a.clientX;
  const dy = b.clientY - a.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeListTitle(list: Partial<SongListOption> | null | undefined): string {
  const raw = list?.title ?? list?.listTitle ?? list?.list_title ?? list?.name ?? "";
  return String(raw || "").trim();
}

function sortListsForPicker(items: SongListOption[]): SongListOption[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.marked) !== Boolean(b.marked)) return a.marked ? -1 : 1;
    return normalizeListTitle(a).localeCompare(normalizeListTitle(b), "el", {
      sensitivity: "base",
    });
  });
}

function isSafeExternalHttpUrl(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;

  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export default function SongPageClient(props: Props) {
  const {
    song,
    canEdit,
    finalLyrics,
    schemaNode,
    defaultPanelsOpen,
    redirectDefault,
    youtubeUrl,
  } = props;

  const router = useRouter();
  const sp = useSearchParams();

  const safeYoutubeUrl = useMemo(() => {
    const raw = String(youtubeUrl || "").trim();
    return isSafeExternalHttpUrl(raw) ? raw : "";
  }, [youtubeUrl]);

  // ✅ Manual open signal for GuidedTour
  const [tourOpenSignal, setTourOpenSignal] = useState(0);

  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [listPickerLoading, setListPickerLoading] = useState(false);
  const [listPickerSubmittingListId, setListPickerSubmittingListId] = useState<number | null>(null);
  const [listPickerError, setListPickerError] = useState<string | null>(null);
  const [listPickerQuery, setListPickerQuery] = useState("");
  const [availableLists, setAvailableLists] = useState<SongListOption[]>([]);
  const [lastAddedList, setLastAddedList] = useState<SongListOption | null>(null);

  // ------------------------------------------------------------
  // List context (NO userId). We pass listId + listPos.
  // ------------------------------------------------------------
  const listId = useMemo(() => {
    const v = sp.get("listId") ?? "";
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [sp]);

  const listPosParam = useMemo(() => {
    const v = sp.get("listPos") ?? "";
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [sp]);

  const hasListContext = Boolean(listId);

  // ------------------------------------------------------------
  // Load ordered song ids for list (same-origin)
  // GET /api/lists/:id/song-ids -> { listId, songIds: number[] }
  // ------------------------------------------------------------
  const [listSongIds, setListSongIds] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!listId) {
        setListSongIds(null);
        return;
      }

      try {
        const res = await fetch(`/api/lists/${listId}/song-ids`, { cache: "no-store" });
        const data = await readJson(res);

        if (!res.ok) {
          if (!cancelled) setListSongIds(null);
          return;
        }

        const idsRaw =
          (data && typeof data === "object" ? (data as any).songIds : null) as unknown | null;

        const ids = Array.isArray(idsRaw)
          ? (idsRaw as unknown[])
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        if (!cancelled) setListSongIds(ids);
      } catch {
        if (!cancelled) setListSongIds(null);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [listId]);

  // ------------------------------------------------------------
  // Resolve current position
  // ------------------------------------------------------------
  const resolvedPos = useMemo(() => {
    if (!listId) return null;
    if (!listSongIds || listSongIds.length === 0) return null;

    if (listPosParam !== null && listPosParam >= 0 && listPosParam < listSongIds.length) {
      const sidAtPos = listSongIds[listPosParam];
      if (sidAtPos === song.id) return listPosParam;
    }

    const idx = listSongIds.findIndex((sid) => sid === song.id);
    return idx >= 0 ? idx : null;
  }, [listId, listPosParam, listSongIds, song.id]);

  const listNav = useMemo(() => {
    if (!listId) return null;
    if (!listSongIds || listSongIds.length === 0) return null;
    if (resolvedPos === null) return null;

    const prevPos = resolvedPos - 1;
    const nextPos = resolvedPos + 1;

    const prevSongId = prevPos >= 0 && prevPos < listSongIds.length ? listSongIds[prevPos] : null;
    const nextSongId = nextPos >= 0 && nextPos < listSongIds.length ? listSongIds[nextPos] : null;

    return {
      listId,
      curPos: resolvedPos,
      prevPos: prevSongId ? prevPos : null,
      nextPos: nextSongId ? nextPos : null,
      prevSongId,
      nextSongId,
    };
  }, [listId, listSongIds, resolvedPos]);

  function buildSongHref(targetSongId: number, targetPos: number | null): string {
    if (listNav && targetPos !== null) {
      return `/songs/${targetSongId}?listId=${encodeURIComponent(
        String(listNav.listId),
      )}&listPos=${encodeURIComponent(String(targetPos))}`;
    }
    return `/songs/${targetSongId}`;
  }

  function goBackToList() {
    if (!listNav) return;
    router.push(`/lists/${listNav.listId}?pos=${encodeURIComponent(String(listNav.curPos))}`);
  }

  function goPrev() {
    if (!listNav?.prevSongId || listNav.prevPos === null) return;
    router.push(buildSongHref(listNav.prevSongId, listNav.prevPos));
  }

  function goNext() {
    if (!listNav?.nextSongId || listNav.nextPos === null) return;
    router.push(buildSongHref(listNav.nextSongId, listNav.nextPos));
  }

  // ------------------------------------------------------------
  // Touch swipe (mobile) for list navigation
  // (ignores multi-touch so it doesn't conflict with lyrics pinch)
  // ------------------------------------------------------------
  const touchRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t0: number;
  } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (!hasListContext) return;
    if (e.touches.length !== 1) return; // ✅ ignore pinch
    const t = e.touches[0];
    touchRef.current = {
      x0: t.clientX,
      y0: t.clientY,
      x1: t.clientX,
      y1: t.clientY,
      t0: Date.now(),
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!hasListContext) return;
    if (!touchRef.current) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchRef.current.x1 = t.clientX;
    touchRef.current.y1 = t.clientY;
  }

  function onTouchEnd() {
    if (!hasListContext) return;
    if (!listNav) return;

    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;

    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dt = Date.now() - s.t0;

    const MIN_X = 60;
    const MAX_Y = 60;
    const MAX_TIME = 900;

    if (adx < MIN_X) return;
    if (ady > MAX_Y) return;
    if (dt > MAX_TIME) return;

    if (dx < 0) goNext();
    else goPrev();
  }

  // ------------------------------------------------------------
  // Desktop swipe (mouse drag) via Pointer Events
  // ------------------------------------------------------------
  const pointerSwipeRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t0: number;
    pointerId: number;
    active: boolean;
  } | null>(null);

  function isInteractiveTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return Boolean(
      el.closest('a,button,input,textarea,select,label,[role="button"],[data-no-swipe]'),
    );
  }

  function onPointerDownSection(e: React.PointerEvent) {
    if (!hasListContext) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;

    pointerSwipeRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      x1: e.clientX,
      y1: e.clientY,
      t0: Date.now(),
      pointerId: e.pointerId,
      active: true,
    };
  }

  function onPointerMoveSection(e: React.PointerEvent) {
    if (!hasListContext) return;
    const s = pointerSwipeRef.current;
    if (!s || !s.active) return;
    if (e.pointerId !== s.pointerId) return;
    s.x1 = e.clientX;
    s.y1 = e.clientY;
  }

  function onPointerUpSection(e: React.PointerEvent) {
    if (!hasListContext) return;
    if (!listNav) return;

    const s = pointerSwipeRef.current;
    pointerSwipeRef.current = null;
    if (!s || !s.active) return;
    if (e.pointerId !== s.pointerId) return;

    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dt = Date.now() - s.t0;

    const MIN_X = 80;
    const MAX_Y = 80;
    const MAX_TIME = 900;

    if (adx < MIN_X) return;
    if (ady > MAX_Y) return;
    if (dt > MAX_TIME) return;

    if (dx < 0) goNext();
    else goPrev();
  }

  // ------------------------------------------------------------
  // Keyboard navigation (desktop): ← / →
  // ------------------------------------------------------------
  useEffect(() => {
    if (!hasListContext) return;

    function onKeyDown(e: KeyboardEvent) {
      if (!listNav) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasListContext, listNav]);

  // ------------------------------------------------------------
  // Panels logic (scores ONLY from assets)
  // ------------------------------------------------------------
  const hasChords = Boolean(song.chords && song.chords.trim() !== "");

  const allAssets: any[] = Array.isArray((song as any).assets) ? (song as any).assets : [];
  const hasAssets = allAssets.length > 0;

  // ✅ score υπάρχει μόνο αν υπάρχει SCORE asset
  const hasScores = allAssets.some((a) => String(a?.type ?? "").toUpperCase() === "SCORE");

  const initialPanels = useMemo(
    () => computeInitialPanels(hasChords, hasScores, hasAssets, defaultPanelsOpen),
    [hasChords, hasScores, hasAssets, defaultPanelsOpen],
  );

  const [panels, setPanels] = useState<PanelsOpen>(initialPanels);

  useEffect(() => {
    setPanels(initialPanels);
  }, [song.id, initialPanels]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pref: RedirectDefault = redirectDefault ?? "TITLE";

    setPanels((prev) => {
      if (pref === "CHORDS") {
        if (!hasChords) return prev;
        return prev.chords ? prev : { ...prev, chords: true };
      }
      if (pref === "SCORE") {
        if (!hasScores) return prev;
        return prev.scores ? prev : { ...prev, scores: true };
      }
      if (pref === "ASSETS") {
        if (!hasAssets) return prev;
        return prev.assets ? prev : { ...prev, assets: true };
      }
      return prev;
    });

    const id =
      pref === "CHORDS"
        ? "song-chords"
        : pref === "LYRICS"
          ? "song-lyrics"
          : pref === "SCORE"
            ? "song-score"
            : pref === "ASSETS"
              ? "song-assets"
              : "song-title";

    const t = window.setTimeout(() => scrollToId(id), 0);
    return () => window.clearTimeout(t);
  }, [song.id, redirectDefault, hasChords, hasAssets, hasScores]);

  function togglePanel<K extends keyof PanelsOpen>(key: K) {
    setPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const filteredLists = useMemo(() => {
    const q = listPickerQuery.trim().toLocaleLowerCase("el");
    const base = sortListsForPicker(availableLists);

    if (!q) return base;

    return base.filter((list) => {
      const title = normalizeListTitle(list).toLocaleLowerCase("el");
      return title.includes(q);
    });
  }, [availableLists, listPickerQuery]);

  async function loadAvailableLists() {
    setListPickerLoading(true);
    setListPickerError(null);

    try {
      const res = await fetch("/api/lists?page=1&pageSize=200", { cache: "no-store" });
      const data = (await readJson(res)) as ListsIndexResponse | { error?: string } | null;

      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Αποτυχία φόρτωσης λιστών.";
        throw new Error(msg);
      }

      const itemsRaw =
        data && typeof data === "object" && Array.isArray((data as any).items)
          ? ((data as any).items as SongListOption[])
          : [];

      setAvailableLists(sortListsForPicker(itemsRaw));
    } catch (e: any) {
      setAvailableLists([]);
      setListPickerError(String(e?.message || e || "Αποτυχία φόρτωσης λιστών."));
    } finally {
      setListPickerLoading(false);
    }
  }

  function openListPicker() {
    setListPickerOpen(true);
    setListPickerError(null);
    setListPickerQuery("");
    void loadAvailableLists();
  }

  function closeListPicker() {
    if (listPickerSubmittingListId !== null) return;
    setListPickerOpen(false);
    setListPickerError(null);
    setListPickerQuery("");
  }

  async function handleAddSongToList(list: SongListOption) {
    setListPickerSubmittingListId(list.id);
    setListPickerError(null);

    try {
      const res = await fetch(`/api/lists/${list.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: song.id }),
      });

      const data = (await readJson(res)) as AddSongToListResponse | { error?: string } | null;

      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Αποτυχία προσθήκης του τραγουδιού στη λίστα.";
        throw new Error(msg);
      }

      setLastAddedList(list);
      setListPickerOpen(false);
      setListPickerQuery("");
    } catch (e: any) {
      setListPickerError(
        String(e?.message || e || "Αποτυχία προσθήκης του τραγουδιού στη λίστα."),
      );
    } finally {
      setListPickerSubmittingListId(null);
    }
  }

  useEffect(() => {
    if (!listPickerOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && listPickerSubmittingListId === null) {
        e.preventDefault();
        closeListPicker();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listPickerOpen, listPickerSubmittingListId]);

  // ------------------------------------------------------------
  // Room action
  // ------------------------------------------------------------
  const roomAction = A.room({
    onClick: () => {
      if (typeof window === "undefined") return;
      const w = window as any;

      if (typeof w.RepRoomsSendSong !== "function") {
        alert("Το σύστημα rooms δεν είναι διαθέσιμο.");
        return;
      }

      const selectedTonicity =
        typeof w.__repSelectedTonicity === "string" ? w.__repSelectedTonicity : null;

      w.RepRoomsSendSong(window.location.href, song.title, song.id, selectedTonicity);
    },
    title: "Αποστολή στο Room",
    label: "Room",
  });

  function openYoutube() {
    if (!safeYoutubeUrl || typeof window === "undefined") return;
    window.open(safeYoutubeUrl, "_blank", "noopener,noreferrer");
  }

  const backHref = hasListContext ? `/lists/${listId}` : "/songs";
  const backLabel = hasListContext ? "Λίστα" : "Τραγούδια";
  const backTitle = hasListContext ? "Επιστροφή στη λίστα" : "Επιστροφή στη λίστα τραγουδιών";

  // ------------------------------------------------------------
  // Draggable "Room" floating button + persistence (localStorage)
  // ------------------------------------------------------------
  const [roomPos, setRoomPos] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [draggingRoom, setDraggingRoom] = useState(false);

  const roomButtonRef = useRef<HTMLDivElement | null>(null);
  const roomDragOffsetRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const roomDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const roomMovedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ROOM_POS_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);

      if (Number.isFinite(x) && Number.isFinite(y)) setRoomPos({ x, y });
    } catch {
      // ignore
    }
  }, []);

  function handleRoomPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const rect = roomButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    roomDragOffsetRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    roomDragStartRef.current = { x: e.clientX, y: e.clientY };
    roomMovedRef.current = false;

    setDraggingRoom(true);

    try {
      roomButtonRef.current?.setPointerCapture?.(e.pointerId);
    } catch {}

    e.preventDefault();
    e.stopPropagation();
  }

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      if (!draggingRoom || !roomDragOffsetRef.current) return;

      if (roomDragStartRef.current) {
        const dx = e.clientX - roomDragStartRef.current.x;
        const dy = e.clientY - roomDragStartRef.current.y;
        if (Math.abs(dx) >= DRAG_CLICK_THRESHOLD_PX || Math.abs(dy) >= DRAG_CLICK_THRESHOLD_PX) {
          roomMovedRef.current = true;
        }
      }

      const nextX = e.clientX - roomDragOffsetRef.current.offsetX;
      const nextY = e.clientY - roomDragOffsetRef.current.offsetY;

      const w = roomButtonRef.current?.offsetWidth ?? 56;
      const h = roomButtonRef.current?.offsetHeight ?? 56;

      const maxX = Math.max(ROOM_MARGIN, window.innerWidth - w - ROOM_MARGIN);
      const maxY = Math.max(ROOM_MARGIN, window.innerHeight - h - ROOM_MARGIN);

      const clampedX = Math.min(Math.max(nextX, ROOM_MARGIN), maxX);
      const clampedY = Math.min(Math.max(nextY, ROOM_MARGIN), maxY);

      setRoomPos({ x: clampedX, y: clampedY });
    }

    function handlePointerUp() {
      if (!draggingRoom) return;

      setDraggingRoom(false);
      roomDragOffsetRef.current = null;
      roomDragStartRef.current = null;

      setRoomPos((prev) => {
        if (prev.x !== null && prev.y !== null) {
          try {
            window.localStorage.setItem(
              ROOM_POS_STORAGE_KEY,
              JSON.stringify({ x: prev.x, y: prev.y }),
            );
          } catch {}
        }
        return prev;
      });
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingRoom]);

  function handleRoomClickCapture(e: React.MouseEvent) {
    if (roomMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      roomMovedRef.current = false;
    }
  }

  // ------------------------------------------------------------
  // Lyrics zoom
  // ------------------------------------------------------------
  const lyricsPreRef = useRef<HTMLPreElement | null>(null);
  const [lyricsScale, setLyricsScale] = useState(1);
  const pinchRef = useRef<{ dist0: number; scale0: number; active: boolean } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LYRICS_SCALE_STORAGE_KEY);
      if (!raw) return;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) setLyricsScale(clampScale(n));
    } catch {}
  }, []);

  function persistLyricsScale(x: number) {
    try {
      window.localStorage.setItem(LYRICS_SCALE_STORAGE_KEY, String(x));
    } catch {}
  }

  function applyLyricsScale(next: number) {
    const clamped = clampScale(next);
    setLyricsScale(clamped);
    persistLyricsScale(clamped);
  }

  useEffect(() => {
    const el = lyricsPreRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const step = 0.08;
      const direction = e.deltaY > 0 ? -1 : 1;

      setLyricsScale((prev) => {
        const next = clampScale(prev + direction * step);
        persistLyricsScale(next);
        return next;
      });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, []);

  useEffect(() => {
    const el = lyricsPreRef.current;
    if (!el) return;

    function onTouchStartNative(e: TouchEvent) {
      if (e.touches.length !== 2) return;
      const d0 = distance2(e.touches[0], e.touches[1]);
      pinchRef.current = { dist0: d0, scale0: lyricsScale, active: true };
      e.preventDefault();
    }

    function onTouchMoveNative(e: TouchEvent) {
      const p = pinchRef.current;
      if (!p?.active) return;
      if (e.touches.length !== 2) return;

      e.preventDefault();

      const d1 = distance2(e.touches[0], e.touches[1]);
      if (p.dist0 <= 0) return;

      const factor = d1 / p.dist0;
      const next = clampScale(p.scale0 * factor);

      setLyricsScale(next);
    }

    function onTouchEndNative() {
      const p = pinchRef.current;
      if (!p?.active) return;
      pinchRef.current = null;

      setLyricsScale((prev) => {
        persistLyricsScale(prev);
        return prev;
      });
    }

    function onGesture(e: Event) {
      e.preventDefault();
    }

    el.addEventListener("touchstart", onTouchStartNative, { passive: false });
    el.addEventListener("touchmove", onTouchMoveNative, { passive: false });
    el.addEventListener("touchend", onTouchEndNative, { passive: true });
    el.addEventListener("touchcancel", onTouchEndNative, { passive: true });

    el.addEventListener("gesturestart", onGesture as any, { passive: false } as any);
    el.addEventListener("gesturechange", onGesture as any, { passive: false } as any);
    el.addEventListener("gestureend", onGesture as any, { passive: false } as any);

    return () => {
      el.removeEventListener("touchstart", onTouchStartNative as any);
      el.removeEventListener("touchmove", onTouchMoveNative as any);
      el.removeEventListener("touchend", onTouchEndNative as any);
      el.removeEventListener("touchcancel", onTouchEndNative as any);

      el.removeEventListener("gesturestart", onGesture as any);
      el.removeEventListener("gesturechange", onGesture as any);
      el.removeEventListener("gestureend", onGesture as any);
    };
  }, [lyricsScale]);

  function lyricsZoomIn() {
    applyLyricsScale(lyricsScale + 0.12);
  }

  function lyricsZoomOut() {
    applyLyricsScale(lyricsScale - 0.12);
  }

  function lyricsZoomReset() {
    applyLyricsScale(1);
  }

  // ------------------------------------------------------------
  // Tour steps
  // ------------------------------------------------------------
  const tourSteps: Step[] = useMemo(() => {
    const steps: Step[] = [
      {
        target: '[data-tour="btn-tunes"]',
        content: "«Tunes»: δείχνει/κρύβει τις τονικότητες ανά τραγουδιστή.",
        disableBeacon: true,
      },
      {
        target: '[data-tour="btn-info"]',
        content: "«Info»: δείχνει/κρύβει πληροφορίες για το τραγούδι.",
      },
      {
        target: '[data-tour="btn-chords"]',
        content: "«Chords»: δείχνει/κρύβει τις συγχορδίες (αν υπάρχουν).",
      },
      {
        target: '[data-tour="btn-scores"]',
        content: "«Scores»: δείχνει/κρύβει την παρτιτούρα (αν υπάρχει).",
      },
      {
        target: '[data-tour="btn-assets"]',
        content: "«Υλικό»: assets (mp3/pdf/links) του τραγουδιού.",
      },
      {
        target: '[data-tour="room-button"]',
        content: "«Room»: στέλνεις το τραγούδι στο room. Μπορείς και να το σύρεις σε άλλη θέση.",
      },
      {
        target: '[data-tour="lyrics-zoom"]',
        content:
          "Zoom στίχων: pinch με 2 δάχτυλα πάνω στους στίχους ή Ctrl+ροδέλα/trackpad pinch. Υπάρχουν και κουμπιά A-/A+.",
      },
    ];

    if (listNav) {
      steps.push({
        target: '[data-tour="nav-buttons"]',
        content: "Πλοήγηση λίστας: προηγούμενο/επόμενο τραγούδι.",
      });
    }

    steps.push({
      target: '[data-tour="scores-section"]',
      content: "Εδώ είναι η περιοχή της παρτιτούρας. Αν υπάρχει αρχείο, θα το δεις σε player.",
    });

    if (hasScores) {
      steps.push({
        target: '[data-tour="scores-player"]',
        content: "Player παρτιτούρας: προβολή/zoom/σελίδες (ανάλογα με το ScorePlayer).",
      });
    }

    steps.push({
      target: "#song-assets",
      content: "Εδώ εμφανίζεται το υλικό του τραγουδιού (audio/pdf/links).",
    });

    return steps;
  }, [listNav, hasScores]);

  function onHelpClick() {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.removeItem(TOUR_STORAGE_KEY);
    } catch {}

    setTourOpenSignal((x) => x + 1);
  }

  return (
    <section
      style={{ padding: "0px 10px", maxWidth: 900, margin: "0 auto", touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDownSection}
      onPointerMove={onPointerMoveSection}
      onPointerUp={onPointerUpSection}
    >
      <ActionBar
        left={<>{A.backLink({ href: backHref, title: backTitle, label: backLabel })}</>}
        right={
          <>
            {safeYoutubeUrl ? (
              <Button
                type="button"
                variant="secondary"
                onClick={openYoutube}
                title="Άνοιγμα αναζήτησης στο YouTube"
                aria-label="Άνοιγμα αναζήτησης στο YouTube"
                icon={PlayCircle}
              >
                YouTube
              </Button>
            ) : null}

            <Button
              type="button"
              variant="secondary"
              onClick={openListPicker}
              title="Προσθήκη του τραγουδιού σε λίστα"
              aria-label="Προσθήκη του τραγουδιού σε λίστα"
              icon={ListMusic}
            >
              Σε λίστα
            </Button>

            {A.help({ title: "Βοήθεια", label: "Βοήθεια", onClick: onHelpClick })}
            {A.share({ shareTitle: song.title, label: "Share" })}

            {canEdit
              ? A.editLink({
                  href: `/songs/${song.id}/edit`,
                  title: "Επεξεργασία τραγουδιού",
                  label: "Επεξεργασία",
                })
              : null}
          </>
        }
      />

      <GuidedTour storageKey={TOUR_STORAGE_KEY} steps={tourSteps} openSignal={tourOpenSignal} />

      {listPickerOpen ? (
        <div
          data-no-swipe
          onClick={() => {
            if (listPickerSubmittingListId === null) closeListPicker();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: "rgba(0, 0, 0, 0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Επιλογή λίστας"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 640,
              maxHeight: "85vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              borderRadius: 18,
              border: "1px solid #333",
              background: "#0b0b0b",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 16px",
                borderBottom: "1px solid #222",
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Προσθήκη σε λίστα</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{song.title}</div>
              </div>

              <Button
                type="button"
                variant="secondary"
                action="cancel"
                onClick={closeListPicker}
                disabled={listPickerSubmittingListId !== null}
                title="Κλείσιμο"
                aria-label="Κλείσιμο"
                iconOnly
              >
                Κλείσιμο
              </Button>
            </div>

            <div style={{ padding: 16, borderBottom: "1px solid #222" }}>
              <input
                type="text"
                value={listPickerQuery}
                onChange={(e) => setListPickerQuery(e.target.value)}
                placeholder="Αναζήτηση λίστας..."
                autoFocus
                style={{
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "#111",
                  color: "inherit",
                  padding: "10px 12px",
                  outline: "none",
                }}
              />
            </div>

            {listPickerError ? (
              <div
                style={{
                  margin: 16,
                  marginBottom: 0,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #6f1f1f",
                  background: "#1f1010",
                  color: "#ffd7d7",
                }}
              >
                {listPickerError}
              </div>
            ) : null}

            <div
              style={{
                padding: 16,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {listPickerLoading ? (
                <div style={{ opacity: 0.85 }}>Φόρτωση λιστών...</div>
              ) : filteredLists.length === 0 ? (
                <div style={{ opacity: 0.85 }}>
                  {availableLists.length === 0
                    ? "Δεν βρέθηκαν διαθέσιμες λίστες."
                    : "Δεν βρέθηκαν λίστες για αυτό το φίλτρο."}
                </div>
              ) : (
                filteredLists.map((list) => {
                  const busy = listPickerSubmittingListId === list.id;
                  const title = normalizeListTitle(list);

                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => void handleAddSongToList(list)}
                      disabled={listPickerSubmittingListId !== null}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        borderRadius: 14,
                        border: "1px solid #333",
                        background: busy ? "#18221a" : "#111",
                        color: "inherit",
                        padding: "12px 14px",
                        cursor: listPickerSubmittingListId !== null ? "not-allowed" : "pointer",
                        opacity: listPickerSubmittingListId !== null && !busy ? 0.7 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{title}</div>
                          <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4 }}>
                            {list.itemsCount} τραγούδια · ρόλος {list.role}
                            {list.marked ? " · pinned" : ""}
                          </div>
                        </div>

                        <div style={{ flexShrink: 0 }}>{busy ? "Προσθήκη..." : "Επιλογή"}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div
              style={{
                padding: 16,
                borderTop: "1px solid #222",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              {A.cancel({
                title: "Κλείσιμο",
                label: "Κλείσιμο",
                disabled: listPickerSubmittingListId !== null,
                onClick: closeListPicker,
              })}
            </div>
          </div>
        </div>
      ) : null}

      <header id="song-title" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>{song.title}</h1>

        {listNav ? (
          <div
            data-tour="nav-buttons"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={goPrev}
              disabled={!listNav.prevSongId || listNav.prevPos === null}
              title="Προηγούμενο τραγούδι"
              aria-label="Προηγούμενο τραγούδι"
              icon={ChevronLeft}
            />

            <Button
              type="button"
              variant="secondary"
              onClick={goBackToList}
              title="Επιστροφή στη λίστα"
              aria-label="Επιστροφή στη λίστα"
              icon={ListMusic}
            >
              Λίστα
            </Button>

            <div
              style={{
                fontSize: "0.95rem",
                opacity: 0.85,
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid #333",
                background: "#111",
                minWidth: 70,
                textAlign: "center",
              }}
              title="Θέση στη λίστα"
            >
              {listNav.curPos + 1} / {listSongIds?.length ?? 0}
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={goNext}
              disabled={!listNav.nextSongId || listNav.nextPos === null}
              title="Επόμενο τραγούδι"
              aria-label="Επόμενο τραγούδι"
              icon={ChevronRight}
            />
          </div>
        ) : null}
      </header>

      {lastAddedList ? (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #1f6f45",
            background: "#0f1f17",
            color: "#d7ffe8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>
            Το τραγούδι προστέθηκε στη λίστα <strong>{normalizeListTitle(lastAddedList)}</strong>.
          </span>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {A.nextLink({
              href: `/lists/${lastAddedList.id}`,
              title: "Άνοιγμα λίστας",
              label: "Άνοιγμα λίστας",
            })}
            {A.cancel({
              title: "Κλείσιμο μηνύματος",
              label: "Κλείσιμο",
              onClick: () => setLastAddedList(null),
            })}
          </div>
        </div>
      ) : null}

      {/* Panel buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 14 }}>
        <span data-tour="btn-tunes" style={{ display: "inline-flex" }}>
          <Button
            type="button"
            variant={panels.singerTunes ? "primary" : "secondary"}
            onClick={() => togglePanel("singerTunes")}
            title={panels.singerTunes ? "Απόκρυψη τονικοτήτων" : "Εμφάνιση τονικοτήτων"}
            aria-pressed={panels.singerTunes}
            icon={Mic}
          >
            Tunes
          </Button>
        </span>

        <span data-tour="btn-info" style={{ display: "inline-flex" }}>
          <Button
            type="button"
            variant={panels.info ? "primary" : "secondary"}
            onClick={() => togglePanel("info")}
            title={panels.info ? "Απόκρυψη πληροφοριών" : "Εμφάνιση πληροφοριών"}
            aria-pressed={panels.info}
            icon={Info}
          >
            Info
          </Button>
        </span>

        <span data-tour="btn-chords" style={{ display: "inline-flex" }}>
          <Button
            type="button"
            variant={panels.chords ? "primary" : "secondary"}
            onClick={() => togglePanel("chords")}
            title={
              !hasChords
                ? "Δεν υπάρχουν ακόρντα για αυτό το τραγούδι"
                : panels.chords
                  ? "Απόκρυψη ακόρντων"
                  : "Εμφάνιση ακόρντων"
            }
            aria-pressed={panels.chords}
            icon={Guitar}
            disabled={!hasChords}
          >
            Chords
          </Button>
        </span>

        <span data-tour="btn-scores" style={{ display: "inline-flex" }}>
          <Button
            type="button"
            variant={panels.scores ? "primary" : "secondary"}
            onClick={() => togglePanel("scores")}
            title={
              !hasScores
                ? "Δεν υπάρχει παρτιτούρα (SCORE asset) για αυτό το τραγούδι"
                : panels.scores
                  ? "Απόκρυψη παρτιτούρας"
                  : "Εμφάνιση παρτιτούρας"
            }
            aria-pressed={panels.scores}
            icon={Music}
            disabled={!hasScores}
          >
            Scores
          </Button>
        </span>

        <SongAssetsPanel
          open={panels.assets}
          hasAssets={hasAssets}
          assets={(song as any).assets ?? []}
          onToggle={() => togglePanel("assets")}
        />
      </div>

      {song.tags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {song.tags.map((t) => (
            <span
              key={t.id}
              style={{
                padding: "4px 10px",
                borderRadius: 99,
                border: "1px solid #333",
                background: "#111",
                fontSize: 14,
              }}
              title={t.slug ? `slug: ${t.slug}` : undefined}
            >
              #{t.title}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, #333, transparent)",
          marginBottom: 14,
          marginTop: 14,
        }}
      />

      <SongInfoToggle
        open={panels.info}
        songTitle={song.title}
        categoryTitle={song.categoryTitle}
        composerName={song.composerName}
        lyricistName={song.lyricistName}
        rythmTitle={song.rythmTitle}
        basedOnSongTitle={song.basedOnSongTitle}
        basedOnSongId={song.basedOnSongId}
        characteristics={song.characteristics}
        views={song.views}
        createdByUserId={song.createdByUserId}
        createdByDisplayName={song.createdByDisplayName}
        status={song.status}
        versions={song.versions}
      />

      <SongSingerTunesClient
        open={panels.singerTunes}
        songId={song.id}
        originalKeySign={song.originalKeySign}
      />

      {hasChords && panels.chords ? (
        <section id="song-chords">
          <SongChordsClient
            chords={song.chords}
            originalKey={song.originalKey}
            originalKeySign={song.originalKeySign}
          />
        </section>
      ) : null}

      <section id="song-lyrics" style={{ marginTop: 4, marginBottom: 28 }}>
        <pre
          data-tour="lyrics-zoom"
          ref={lyricsPreRef}
          style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            padding: 8,
            margin: 0,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#0b0b0b",
            fontSize: Math.round(LYRICS_BASE_FONT_SIZE * lyricsScale),
            lineHeight: 1.6,
            touchAction: "pan-y",
            WebkitTextSizeAdjust: "100%",
          }}
        >
          {finalLyrics}
        </pre>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Button type="button" variant="secondary" onClick={lyricsZoomOut} title="Zoom out">
            A-
          </Button>
          <Button type="button" variant="secondary" onClick={lyricsZoomIn} title="Zoom in">
            A+
          </Button>
          <Button type="button" variant="secondary" onClick={lyricsZoomReset} title="Reset">
            Reset
          </Button>
        </div>
      </section>

      {/* ✅ Scores panel (ONLY from assets) */}
      <SongScoresPanel open={panels.scores} assets={(song as any).assets ?? []} />

      {schemaNode}

      {/* Draggable floating Room button (fixed) */}
      <div
        data-no-swipe
        data-tour="room-button"
        ref={roomButtonRef}
        onPointerDown={handleRoomPointerDown}
        onClickCapture={handleRoomClickCapture}
        style={{
          position: "fixed",
          zIndex: 1000,
          cursor: draggingRoom ? "grabbing" : "grab",
          right: roomPos.x === null ? ROOM_MARGIN : undefined,
          bottom: roomPos.y === null ? ROOM_MARGIN : undefined,
          left: roomPos.x !== null ? roomPos.x : undefined,
          top: roomPos.y !== null ? roomPos.y : undefined,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {roomAction}
      </div>
    </section>
  );
}