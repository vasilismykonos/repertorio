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
import SongListPickerModal from "./SongListPickerModal";
import type { ListItemToneValue } from "@/app/components/ListItemTonePicker";
import type { Step } from "react-joyride";
import type { SongDetail } from "./page";
import {
  readOfflineListsForCurrentUser,
  readOfflineSongs,
  writeOfflineSongDetail,
} from "@/lib/offlineStore";

const GuidedTour = dynamic(
  () =>
    import("../../components/GuidedTour").catch(() => ({
      default: () => null,
    })),
  { ssr: false },
);

const ROOM_SENT_FLASH_MS = 1200;

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
  listItemId?: number | null;
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
  selectedSingerTuneTitle?: string | null;
  selectedSingerTuneTune?: string | null;
  containsSong?: boolean;
  selected?: boolean;
  isSelected?: boolean;
  name?: string;
  listTitle?: string;
  list_title?: string;
};

type ListGroupOption = {
  id: number;
  title: string;
  fullTitle?: string | null;
  listsCount?: number;
};

type ListsIndexResponse = {
  items: SongListOption[];
  total: number;
  page: number;
  pageSize: number;
  groups?: ListGroupOption[];
};

type AddSongToListResponse = {
  listItemId: number;
  listId: number;
  sortId: number;
  songId: number | null;
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
  selectedSingerTuneTitle?: string | null;
  selectedSingerTuneTune?: string | null;
  title: string | null;
  itemsCount?: number;
};

type ListNavItem = {
  songId: number;
  title: string | null;
  selectedTonicity: string | null;
  selectedTonicitySign: "+" | "-" | null;
  selectedSingerTuneId: number | null;
};

type ListNavState = {
  listId: number;
  curPos: number;
  prevPos: number | null;
  nextPos: number | null;
  prevSongId: number | null;
  nextSongId: number | null;
};

const HEADER_OFFSET_PX = 0;

const ROOM_POS_STORAGE_KEY = "repertorio_room_button_pos_v1";
const ROOM_MARGIN = 16;
const DRAG_CLICK_THRESHOLD_PX = 6;
const LIST_SWIPE_LOCK_PX = 8;
const LIST_SWIPE_MIN_X = 28;
const LIST_SWIPE_DISTANCE_RATIO = 0.09;
const LIST_SWIPE_MAX_TRIGGER_X = 48;
const LIST_SWIPE_FLICK_MIN_X = 22;
const LIST_SWIPE_FLICK_VELOCITY = 0.24;
const LIST_SWIPE_MAX_Y = 120;
const LIST_SWIPE_SETTLE_MS = 170;
const LIST_SWIPE_NAV_FALLBACK_MS = 5000;
const LIST_SWIPE_MAX_VISUAL_OFFSET = 360;

const TOUR_STORAGE_KEY = "tour_song_page_v1";
const LIST_PICKER_LAST_SELECTED_STORAGE_KEY = "repertorio_last_selected_list_id_v1";

const LYRICS_SCALE_STORAGE_KEY = "repertorio_lyrics_scale_v1";
const LYRICS_BASE_FONT_SIZE = 15;
const LYRICS_SCALE_MIN = 0.75;
const LYRICS_SCALE_MAX = 2.2;

function scrollToId(id: string) {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function hasMxlExtension(value: string | null | undefined): boolean {
  if (!value) return false;
  const clean = value.split("?")[0].split("#")[0].trim().toLowerCase();
  return clean.endsWith(".mxl");
}

function hasMxlMimeType(value: string | null | undefined): boolean {
  if (!value) return false;
  const mt = value.trim().toLowerCase();
  return (
    mt.includes("application/vnd.recordare.musicxml") ||
    mt.includes("application/vnd.recordare.musicxml+xml") ||
    mt.includes("application/x-mxl") ||
    mt.includes("musicxml") ||
    mt.includes("/mxl")
  );
}

function isMxlScoreAsset(asset: any): boolean {
  if (!asset || typeof asset !== "object") return false;
  return (
    hasMxlMimeType(asset.mimeType) ||
    hasMxlExtension(asset.filePath) ||
    hasMxlExtension(asset.url) ||
    hasMxlExtension(asset.title)
  );
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
    scores: defaults?.scores ?? hasScores,
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

function stripTrailingCount(label: string): string {
  return String(label || "").replace(/\s*\(\d+\)\s*$/, "").trim();
}

function normalizeGroupTitle(group: Partial<ListGroupOption> | null | undefined): string {
  const raw = group?.fullTitle || group?.title || "";
  return stripTrailingCount(raw);
}

function sortGroupsForPicker(items: ListGroupOption[]): ListGroupOption[] {
  const seen = new Set<number>();
  const out: ListGroupOption[] = [];

  for (const group of items) {
    const id = Number(group?.id);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      ...group,
      id,
      title: normalizeGroupTitle(group) || group.title || `Ομάδα #${id}`,
    });
  }

  return out.sort((a, b) =>
    normalizeGroupTitle(a).localeCompare(normalizeGroupTitle(b), "el", {
      sensitivity: "base",
    }),
  );
}

function toNullablePositiveInt(value: unknown, fallback: number | null = null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function nullableSign(value: unknown): "+" | "-" | null {
  return value === "+" || value === "-" ? value : null;
}

function normalizeListNavItem(item: any): ListNavItem | null {
  const songId = Number(item?.songId ?? item?.song_id);
  if (!Number.isFinite(songId) || songId <= 0) return null;

  const selectedSingerTuneId = Number(item?.selectedSingerTuneId ?? item?.selected_singer_tune_id ?? 0);

  return {
    songId: Math.trunc(songId),
    title: nullableText(item?.title ?? item?.songTitle ?? item?.song_title ?? item?.name),
    selectedTonicity: nullableText(item?.selectedTonicity ?? item?.selected_tonicity),
    selectedTonicitySign: nullableSign(item?.selectedTonicitySign ?? item?.selected_tonicity_sign),
    selectedSingerTuneId:
      Number.isFinite(selectedSingerTuneId) && selectedSingerTuneId > 0
        ? Math.trunc(selectedSingerTuneId)
        : null,
  };
}

function normalizeListNavItemsFromPayload(data: any): ListNavItem[] {
  const itemsRaw = data && typeof data === "object" ? data.items : null;
  const idsRaw = data && typeof data === "object" ? data.songIds : null;

  const itemsFromPayload = Array.isArray(itemsRaw)
    ? itemsRaw
        .map(normalizeListNavItem)
        .filter((item): item is ListNavItem => Boolean(item))
    : [];

  if (itemsFromPayload.length > 0) return itemsFromPayload;

  return Array.isArray(idsRaw)
    ? idsRaw
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((songId) => ({
          songId: Math.trunc(songId),
          title: null,
          selectedTonicity: null,
          selectedTonicitySign: null,
          selectedSingerTuneId: null,
        }))
    : [];
}

async function readOfflineListNavItems(listId: number): Promise<ListNavItem[] | null> {
  const snapshot = await readOfflineListsForCurrentUser().catch(() => null);
  const key = String(listId);
  const detail = snapshot?.detailsById?.[key] || null;

  if (detail) {
    const items = normalizeListNavItemsFromPayload(detail);
    if (items.length > 0) return items;
  }

  const summaries = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  const summary = summaries.find((item: any) => Number(item?.id ?? item?.listId) === listId) || null;
  const summaryItems = normalizeListNavItemsFromPayload(summary);
  return summaryItems.length > 0 ? summaryItems : null;
}

function isListAlreadySelected(list: Partial<SongListOption> | null | undefined): boolean {
  return Boolean(list?.containsSong || list?.selected || list?.isSelected);
}

function toneValueFromListSelection(
  list: Partial<SongListOption> | null | undefined,
): ListItemToneValue {
  return {
    selectedTonicity: nullableText(list?.selectedTonicity),
    selectedTonicitySign: nullableSign(list?.selectedTonicitySign),
    selectedSingerTuneId: toNullablePositiveInt(list?.selectedSingerTuneId),
    selectedSingerTuneTitle: nullableText(list?.selectedSingerTuneTitle),
    selectedSingerTuneTune: nullableText(list?.selectedSingerTuneTune),
  };
}

function listWithToneSelection(
  list: SongListOption,
  value: ListItemToneValue,
): SongListOption {
  return {
    ...list,
    selectedTonicity: nullableText(value.selectedTonicity),
    selectedTonicitySign: nullableSign(value.selectedTonicitySign),
    selectedSingerTuneId: toNullablePositiveInt(value.selectedSingerTuneId),
    selectedSingerTuneTitle: nullableText(value.selectedSingerTuneTitle),
    selectedSingerTuneTune: nullableText(value.selectedSingerTuneTune),
  };
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

function cleanSongText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return cleanSongText(String(value));

  const text = value.trim();
  if (!text) return null;

  const upper = text.toUpperCase();
  if (upper === "NULL" || upper === "UNDEFINED" || upper === "N/A") return null;

  return text;
}

function pickSongText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanSongText(value);
    if (text) return text;
  }
  return null;
}

function normalizeSongTagsForClient(raw: unknown): SongDetail["tags"] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<number, SongDetail["tags"][number]>();

  for (const tag of raw as any[]) {
    const id = Number(tag?.id);
    const title = cleanSongText(tag?.title);
    if (!Number.isFinite(id) || id <= 0 || !title) continue;

    if (!byId.has(id)) {
      byId.set(id, {
        id,
        title,
        slug: cleanSongText(tag?.slug) || "",
      });
    }
  }

  return Array.from(byId.values());
}

function normalizeSongAssetsForClient(raw: unknown): SongDetail["assets"] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((asset: any) => {
      const id = Number(asset?.id);
      if (!Number.isFinite(id) || id <= 0) return null;

      const sort = Number(asset?.sort);

      return {
        id,
        kind: String(asset?.kind ?? "").toUpperCase() === "LINK" ? "LINK" : "FILE",
        type: String(asset?.type ?? "GENERIC").toUpperCase(),
        title: cleanSongText(asset?.title),
        url: cleanSongText(asset?.url),
        filePath: cleanSongText(asset?.filePath ?? asset?.file_path),
        mimeType: cleanSongText(asset?.mimeType ?? asset?.mime_type),
        sizeBytes: cleanSongText(asset?.sizeBytes ?? asset?.size_bytes),
        label: cleanSongText(asset?.label),
        sort: Number.isFinite(sort) ? sort : 0,
        isPrimary: asset?.isPrimary === true || asset?.is_primary === true,
      } satisfies SongDetail["assets"][number];
    })
    .filter((asset): asset is SongDetail["assets"][number] => Boolean(asset))
    .sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.id - b.id;
    });
}

function normalizeSongVersionsForClient(raw: unknown): SongDetail["versions"] {
  if (!Array.isArray(raw)) return [];

  return raw.map((version: any, index: number) => {
    const id = Number(version?.id ?? version?.versionId ?? version?.version_id ?? index + 1);
    const yearRaw = version?.year ?? version?.Year ?? version?.releaseYear ?? version?.release_year;
    const year = Number(yearRaw);

    return {
      id: Number.isFinite(id) && id > 0 ? id : index + 1,
      year: Number.isFinite(year) ? year : null,
      singerFront: pickSongText(
        version?.singerFront,
        version?.singer_front,
        version?.singer_front_name,
        version?.singerFrontName,
        version?.singerFrontTitle,
      ),
      singerBack: pickSongText(
        version?.singerBack,
        version?.singer_back,
        version?.singer_back_name,
        version?.singerBackName,
      ),
      solist: pickSongText(
        version?.solist,
        version?.soloist,
        version?.solist_name,
        version?.soloist_name,
        version?.solistName,
        version?.soloistName,
      ),
      youtubeSearch: pickSongText(
        version?.youtubeSearch,
        version?.youtube_search,
        version?.youtubeQuery,
        version?.youtube_query,
      ),
      singerFrontId:
        version?.singerFrontId ?? version?.singer_front_id ?? version?.singerfront_id ?? null,
      singerBackId:
        version?.singerBackId ?? version?.singer_back_id ?? version?.singerback_id ?? null,
      solistId: version?.solistId ?? version?.soloistId ?? version?.solist_id ?? version?.soloist_id ?? null,
    };
  });
}

function normalizeSongDetailForClient(raw: any): SongDetail | null {
  if (!raw || typeof raw !== "object") return null;

  const id = Number(raw.id ?? raw.songId ?? raw.song_id ?? raw.legacySongId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const assets = normalizeSongAssetsForClient(raw.assets);
  const title = cleanSongText(raw.title) || `Τραγούδι #${Math.trunc(id)}`;

  return {
    id: Math.trunc(id),
    title,
    firstLyrics: raw.firstLyrics ?? raw.first_lyrics ?? null,
    lyrics: raw.lyrics ?? null,
    characteristics: raw.characteristics ?? null,
    originalKey: raw.originalKey ?? raw.original_key ?? null,
    originalKeySign: nullableSign(raw.originalKeySign ?? raw.original_key_sign),
    chords: raw.chords ?? null,
    status: raw.status ?? null,

    categoryId: raw.categoryId ?? raw.category_id ?? null,
    rythmId: raw.rythmId ?? raw.rythm_id ?? raw.rhythmId ?? raw.rhythm_id ?? null,
    makamId: raw.makamId ?? raw.makam_id ?? null,

    categoryTitle: raw.categoryTitle ?? raw.category_title ?? null,
    composerName: raw.composerName ?? raw.composer_name ?? null,
    lyricistName: raw.lyricistName ?? raw.lyricist_name ?? null,
    rythmTitle:
      raw.rythmTitle ?? raw.rythm_title ?? raw.rhythmTitle ?? raw.rhythm_title ?? null,
    basedOnSongId: raw.basedOnSongId ?? raw.based_on_song_id ?? null,
    basedOnSongTitle: raw.basedOnSongTitle ?? raw.based_on_song_title ?? null,
    views: typeof raw.views === "number" ? raw.views : Number(raw.views ?? 0) || 0,

    createdByUserId:
      raw.createdByUserId ??
      raw.createdById ??
      raw.created_by_user_id ??
      raw.created_by_id ??
      null,
    createdByDisplayName:
      raw.createdByDisplayName ??
      raw.createdByName ??
      raw.created_by_display_name ??
      raw.created_by_name ??
      null,

    tags: normalizeSongTagsForClient(raw.tags),
    hasScore: Boolean(raw.hasScore ?? raw.partiture) || assets.some((asset) => isMxlScoreAsset(asset)),
    assets,
    versions: normalizeSongVersionsForClient(raw.versions),
  };
}

function songIsOrganicForClient(song: SongDetail): boolean {
  const byTags = song.tags.some((tag) => {
    const title = String(tag.title || "").trim().toLocaleLowerCase("el-GR");
    const slug = String(tag.slug || "").trim().toLocaleLowerCase("el-GR");
    return title === "οργανικό" || slug === "οργανικό";
  });
  if (byTags) return true;

  return String(song.characteristics || "")
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase("el-GR"))
    .some((item) => item === "οργανικό");
}

function finalLyricsForSong(song: SongDetail): string {
  if (songIsOrganicForClient(song)) return "(Οργανικό)";
  if (!song.lyrics || song.lyrics.trim() === "") return "(Χωρίς διαθέσιμους στίχους)";
  return song.lyrics;
}

function youtubeUrlForSong(song: SongDetail): string {
  const words = String(song.firstLyrics || song.lyrics || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.title} ${words}`.trim())}`;
}

function YouTubeActionButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Άνοιγμα αναζήτησης στο YouTube"
      aria-label="Άνοιγμα αναζήτησης στο YouTube"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        minHeight: 36,
        padding: "0 13px",
        border: "1px solid rgba(255,255,255,0.16)",
        borderRadius: 8,
        background: "#ff0000",
        color: "#fff",
        fontSize: 14,
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: 0,
        boxShadow: "0 2px 8px rgba(255,0,0,0.25)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.74 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 16,
          borderRadius: 4,
          background: "#fff",
          color: "#ff0000",
          flex: "0 0 auto",
        }}
      >
        <svg width="8" height="9" viewBox="0 0 8 9" focusable="false">
          <path
            fill="currentColor"
            d="M7.4 4.5.8 8.3V.7l6.6 3.8Z"
          />
        </svg>
      </span>
      <span>YouTube</span>
    </button>
  );
}

function offlineSongIdForClient(value: any): number | null {
  const id = Math.trunc(Number(value?.id ?? value?.legacySongId ?? value?.song_id ?? value?.songId));
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function readOfflineSongDetailForClient(songId: number): Promise<SongDetail | null> {
  const id = Math.trunc(Number(songId));
  if (!Number.isFinite(id) || id <= 0) return null;

  const snapshot = await readOfflineSongs().catch(() => null);
  const detail = snapshot?.detailsById?.[String(id)] || null;
  if (detail) return normalizeSongDetailForClient(detail);

  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const summary = items.find((item: any) => offlineSongIdForClient(item) === id) || null;
  return summary ? normalizeSongDetailForClient(summary) : null;
}

async function loadSongDetailForClient(songId: number): Promise<SongDetail | null> {
  const id = Math.trunc(Number(songId));
  if (!Number.isFinite(id) || id <= 0) return null;

  const offlineDetailPromise = readOfflineSongDetailForClient(id).catch(() => null);
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (isOffline) return offlineDetailPromise;

  try {
    const res = await fetch(`/api/songs/${id}?noIncrement=1`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await readJson(res);
    if (res.ok) {
      const detail = normalizeSongDetailForClient(data);
      if (detail) {
        void writeOfflineSongDetail(detail).catch(() => null);
        return detail;
      }
    }
  } catch {
    // Fall back to offline cache below.
  }

  return offlineDetailPromise;
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    void writeOfflineSongDetail(song).catch(() => null);
  }, [song]);

  const safeYoutubeUrl = useMemo(() => {
    const raw = String(youtubeUrl || "").trim();
    return isSafeExternalHttpUrl(raw) ? raw : "";
  }, [youtubeUrl]);

  const [tourOpenSignal, setTourOpenSignal] = useState(0);

  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [listPickerLoading, setListPickerLoading] = useState(false);
  const [listPickerSubmittingListId, setListPickerSubmittingListId] = useState<number | null>(null);
  const [listPickerError, setListPickerError] = useState<string | null>(null);
  const [listPickerQuery, setListPickerQuery] = useState("");
  const [availableLists, setAvailableLists] = useState<SongListOption[]>([]);
  const [availableListGroups, setAvailableListGroups] = useState<ListGroupOption[]>([]);
  const [lastSelectedListId, setLastSelectedListId] = useState<number | null>(null);
  const [lastAddedList, setLastAddedList] = useState<SongListOption | null>(null);
  const [listPickerToneSelection, setListPickerToneSelection] = useState<ListItemToneValue>({
    selectedTonicity: null,
    selectedTonicitySign: null,
    selectedSingerTuneId: null,
    selectedSingerTuneTitle: null,
    selectedSingerTuneTune: null,
  });
  const [listPickerToneByListId, setListPickerToneByListId] = useState<
    Record<number, ListItemToneValue>
  >({});
  const [roomSendConfirmed, setRoomSendConfirmed] = useState(false);
  const roomSendFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (roomSendFlashTimerRef.current) {
        clearTimeout(roomSendFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(LIST_PICKER_LAST_SELECTED_STORAGE_KEY);
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0) setLastSelectedListId(id);
    } catch {}
  }, []);

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

  const urlTonicity = useMemo(() => {
    const value = sp.get("tonicity");
    return value && value.trim() ? value.trim() : null;
  }, [sp]);

  const urlTonicitySign = useMemo(() => {
    const value = sp.get("tonicitySign");
    return value === "+" || value === "-" ? value : null;
  }, [sp]);

  const selectedSingerTuneId = useMemo(() => {
    const n = Number(sp.get("singerTuneId") ?? "");
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [sp]);

  const hasListContext = Boolean(listId);

  const [listNavItems, setListNavItems] = useState<ListNavItem[] | null>(null);
  const listSongIds = useMemo(
    () => (listNavItems ? listNavItems.map((item) => item.songId) : null),
    [listNavItems],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!listId) {
        setListNavItems(null);
        return;
      }

      const applyOfflineFallback = async () => {
        const offlineItems = await readOfflineListNavItems(listId).catch(() => null);
        if (!cancelled) setListNavItems(offlineItems);
      };

      try {
        const res = await fetch(`/api/lists/${listId}/song-ids`, { cache: "no-store" });
        const data = await readJson(res);

        if (!res.ok) {
          await applyOfflineFallback();
          return;
        }

        const items = normalizeListNavItemsFromPayload(data);

        if (items.length > 0) {
          if (!cancelled) setListNavItems(items);
          return;
        }

        await applyOfflineFallback();
      } catch {
        await applyOfflineFallback();
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [listId]);

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

  const listNav = useMemo<ListNavState | null>(() => {
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

  function listNavForPos(pos: number | null | undefined): ListNavState | null {
    if (!listId || !listSongIds || pos === null || pos === undefined) return null;
    if (pos < 0 || pos >= listSongIds.length) return null;

    const prevPos = pos - 1;
    const nextPos = pos + 1;
    const prevSongId = prevPos >= 0 && prevPos < listSongIds.length ? listSongIds[prevPos] : null;
    const nextSongId = nextPos >= 0 && nextPos < listSongIds.length ? listSongIds[nextPos] : null;

    return {
      listId,
      curPos: pos,
      prevPos: prevSongId ? prevPos : null,
      nextPos: nextSongId ? nextPos : null,
      prevSongId,
      nextSongId,
    };
  }

  const currentListNavItem =
    resolvedPos !== null && listNavItems && resolvedPos >= 0 && resolvedPos < listNavItems.length
      ? listNavItems[resolvedPos]
      : null;

  const effectiveUrlTonicity = urlTonicity || currentListNavItem?.selectedTonicity || null;
  const effectiveUrlTonicitySign =
    urlTonicitySign || currentListNavItem?.selectedTonicitySign || null;
  const effectiveSelectedSingerTuneId =
    selectedSingerTuneId || currentListNavItem?.selectedSingerTuneId || null;
  const adjacentSongCacheRef = useRef<Map<number, SongDetail>>(new Map());
  const [adjacentSongs, setAdjacentSongs] = useState<{
    prev: SongDetail | null;
    next: SongDetail | null;
  }>({ prev: null, next: null });

  useEffect(() => {
    let cancelled = false;
    const prevSongId = listNav?.prevSongId ?? null;
    const nextSongId = listNav?.nextSongId ?? null;

    setAdjacentSongs({
      prev: prevSongId ? adjacentSongCacheRef.current.get(prevSongId) ?? null : null,
      next: nextSongId ? adjacentSongCacheRef.current.get(nextSongId) ?? null : null,
    });

    async function loadOne(direction: "prev" | "next", songId: number | null) {
      if (!songId) return;

      const cached = adjacentSongCacheRef.current.get(songId);
      if (cached) {
        if (!cancelled) {
          setAdjacentSongs((current) => ({ ...current, [direction]: cached }));
        }
        return;
      }

      const detail = await loadSongDetailForClient(songId).catch(() => null);
      if (cancelled || !detail) return;

      adjacentSongCacheRef.current.set(songId, detail);
      setAdjacentSongs((current) => ({ ...current, [direction]: detail }));
    }

    void loadOne("prev", prevSongId);
    void loadOne("next", nextSongId);

    return () => {
      cancelled = true;
    };
  }, [listNav?.prevSongId, listNav?.nextSongId]);

  function buildSongHref(targetSongId: number, targetPos: number | null): string {
    if (listNav && targetPos !== null) {
      const params = new URLSearchParams({
        listId: String(listNav.listId),
        listPos: String(targetPos),
      });
      const item = listNavItems?.[targetPos] || null;
      if (item?.selectedTonicity) params.set("tonicity", item.selectedTonicity);
      if (item?.selectedTonicitySign) params.set("tonicitySign", item.selectedTonicitySign);
      if (item?.selectedSingerTuneId) params.set("singerTuneId", String(item.selectedSingerTuneId));
      return `/songs/${targetSongId}?${params.toString()}`;
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

  const swipeViewportRef = useRef<HTMLElement | null>(null);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);
  const [swipeSettling, setSwipeSettling] = useState(false);
  const swipeResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touchRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t0: number;
    lock: "x" | "y" | null;
  } | null>(null);

  const pointerSwipeRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t0: number;
    pointerId: number;
    active: boolean;
    lock: "x" | "y" | null;
  } | null>(null);

  function clearSwipeResetTimer() {
    if (swipeResetTimerRef.current) {
      clearTimeout(swipeResetTimerRef.current);
      swipeResetTimerRef.current = null;
    }
  }

  function resetSwipeVisual() {
    clearSwipeResetTimer();
    setSwipeDragging(false);
    setSwipeSettling(false);
    setSwipeOffsetX(0);
  }

  function cancelSwipeGesture() {
    touchRef.current = null;
    pointerSwipeRef.current = null;
    resetSwipeVisual();
  }

  function canSwipeDirection(dx: number) {
    if (!listNav) return false;
    if (dx < 0) return Boolean(listNav.nextSongId && listNav.nextPos !== null);
    if (dx > 0) return Boolean(listNav.prevSongId && listNav.prevPos !== null);
    return false;
  }

  function hasAdjacentSwipeSurface(dx: number) {
    if (dx < 0) return Boolean(adjacentSongs.next);
    if (dx > 0) return Boolean(adjacentSongs.prev);
    return false;
  }

  function canCompleteSwipe(dx: number) {
    return canSwipeDirection(dx) && hasAdjacentSwipeSurface(dx);
  }

  function swipeViewportWidth() {
    const measured = swipeViewportRef.current?.getBoundingClientRect().width;
    if (measured && Number.isFinite(measured) && measured > 0) return measured;
    if (typeof window !== "undefined" && Number.isFinite(window.innerWidth)) {
      return window.innerWidth;
    }
    return 360;
  }

  function visualSwipeOffset(dx: number) {
    const viewportWidth = swipeViewportWidth();
    const maxOffset = Math.min(
      LIST_SWIPE_MAX_VISUAL_OFFSET,
      Math.max(160, viewportWidth * 0.82),
    );
    const resisted = canCompleteSwipe(dx) ? dx : dx * 0.22;
    return Math.max(-maxOffset, Math.min(maxOffset, resisted));
  }

  function swipeTriggerDistance() {
    const viewportWidth = swipeViewportWidth();
    return Math.min(
      LIST_SWIPE_MAX_TRIGGER_X,
      Math.max(LIST_SWIPE_MIN_X, viewportWidth * LIST_SWIPE_DISTANCE_RATIO),
    );
  }

  function lockSwipeAxis(dx: number, dy: number): "x" | "y" | null {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < LIST_SWIPE_LOCK_PX && ady < LIST_SWIPE_LOCK_PX) return null;
    return adx > ady * 1.15 ? "x" : "y";
  }

  function updateSwipeVisual(dx: number) {
    setSwipeDragging(true);
    setSwipeSettling(false);
    setSwipeOffsetX(visualSwipeOffset(dx));
  }

  function finishSwipe(dx: number, dy: number, dt: number) {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const velocity = dt > 0 ? adx / dt : 0;
    const triggerDistance = swipeTriggerDistance();
    const mostlyHorizontal = ady <= Math.max(LIST_SWIPE_MAX_Y, adx * 0.7);
    const passedDistance = adx >= triggerDistance;
    const flicked = adx >= LIST_SWIPE_FLICK_MIN_X && velocity >= LIST_SWIPE_FLICK_VELOCITY;
    const shouldNavigate =
      mostlyHorizontal &&
      (passedDistance || flicked) &&
      canCompleteSwipe(dx);

    setSwipeDragging(false);

    if (!shouldNavigate) {
      setSwipeSettling(true);
      setSwipeOffsetX(0);
      clearSwipeResetTimer();
      swipeResetTimerRef.current = setTimeout(() => {
        setSwipeSettling(false);
        swipeResetTimerRef.current = null;
      }, LIST_SWIPE_SETTLE_MS);
      return;
    }

    const viewportWidth = swipeViewportWidth();
    const exitOffset = dx < 0 ? -viewportWidth : viewportWidth;

    setSwipeSettling(true);
    setSwipeOffsetX(exitOffset);
    clearSwipeResetTimer();
    swipeResetTimerRef.current = setTimeout(() => {
      if (dx < 0) goNext();
      else goPrev();

      swipeResetTimerRef.current = setTimeout(() => {
        setSwipeOffsetX(0);
        setSwipeSettling(false);
        swipeResetTimerRef.current = null;
      }, LIST_SWIPE_NAV_FALLBACK_MS);
    }, LIST_SWIPE_SETTLE_MS);
  }

  useEffect(() => {
    return () => clearSwipeResetTimer();
  }, []);

  useEffect(() => {
    touchRef.current = null;
    pointerSwipeRef.current = null;
    resetSwipeVisual();
  }, [song.id, listId]);

  useEffect(() => {
    if (!listNav) return;

    try {
      if (listNav.prevSongId && listNav.prevPos !== null) {
        router.prefetch(buildSongHref(listNav.prevSongId, listNav.prevPos));
      }
      if (listNav.nextSongId && listNav.nextPos !== null) {
        router.prefetch(buildSongHref(listNav.nextSongId, listNav.nextPos));
      }
    } catch {
      // Prefetch is an enhancement; normal navigation still works without it.
    }
  }, [
    listNav?.listId,
    listNav?.prevSongId,
    listNav?.prevPos,
    listNav?.nextSongId,
    listNav?.nextPos,
    listNavItems,
    router,
  ]);

  function onTouchStart(e: React.TouchEvent) {
    if (!hasListContext) return;
    if (e.touches.length !== 1) return;
    if (isInteractiveTarget(e.target)) return;
    const t = e.touches[0];
    clearSwipeResetTimer();
    touchRef.current = {
      x0: t.clientX,
      y0: t.clientY,
      x1: t.clientX,
      y1: t.clientY,
      t0: Date.now(),
      lock: null,
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!hasListContext) return;
    if (!touchRef.current) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchRef.current.x1 = t.clientX;
    touchRef.current.y1 = t.clientY;

    const dx = t.clientX - touchRef.current.x0;
    const dy = t.clientY - touchRef.current.y0;

    if (!touchRef.current.lock) {
      touchRef.current.lock = lockSwipeAxis(dx, dy);
    }

    if (touchRef.current.lock === "x") {
      updateSwipeVisual(dx);
    }
  }

  function onTouchEnd() {
    if (!hasListContext) return;

    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    if (s.lock !== "x") {
      resetSwipeVisual();
      return;
    }

    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const dt = Date.now() - s.t0;

    finishSwipe(dx, dy, dt);
  }

  function isInteractiveTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return Boolean(
      el.closest('a,button,input,textarea,select,label,[role="button"],[data-no-swipe]'),
    );
  }

  function onPointerDownSection(e: React.PointerEvent) {
    if (!hasListContext) return;
    if (e.pointerType !== "mouse") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is best-effort for desktop drag.
    }

    clearSwipeResetTimer();
    pointerSwipeRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      x1: e.clientX,
      y1: e.clientY,
      t0: Date.now(),
      pointerId: e.pointerId,
      active: true,
      lock: null,
    };
  }

  function onPointerMoveSection(e: React.PointerEvent) {
    if (!hasListContext) return;
    const s = pointerSwipeRef.current;
    if (!s || !s.active) return;
    if (e.pointerId !== s.pointerId) return;
    s.x1 = e.clientX;
    s.y1 = e.clientY;

    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;

    if (!s.lock) {
      s.lock = lockSwipeAxis(dx, dy);
    }

    if (s.lock === "x") {
      updateSwipeVisual(dx);
    }
  }

  function onPointerUpSection(e: React.PointerEvent) {
    if (!hasListContext) return;

    const s = pointerSwipeRef.current;
    pointerSwipeRef.current = null;
    if (!s || !s.active) return;
    if (e.pointerId !== s.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Best-effort cleanup.
    }

    if (s.lock !== "x") {
      resetSwipeVisual();
      return;
    }

    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const dt = Date.now() - s.t0;

    finishSwipe(dx, dy, dt);
  }

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

  const hasChords = Boolean(song.chords && song.chords.trim() !== "");

  const allAssets: any[] = Array.isArray((song as any).assets) ? (song as any).assets : [];
  const hasAssets = allAssets.length > 0;
  const hasScores =
    Boolean((song as any).hasScore) || allAssets.some((a) => isMxlScoreAsset(a));

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

  const listGroupTitleById = useMemo(() => {
    const titles = new Map<number, string>();

    for (const group of availableListGroups) {
      const id = Number(group.id);
      if (!Number.isFinite(id) || id <= 0 || titles.has(id)) continue;
      titles.set(id, normalizeGroupTitle(group));
    }

    return titles;
  }, [availableListGroups]);

  const filteredLists = useMemo(() => {
    const q = listPickerQuery.trim().toLocaleLowerCase("el");
    const base = sortListsForPicker(availableLists);
    if (!q) return base;

    return base.filter((list) => {
      const title = normalizeListTitle(list).toLocaleLowerCase("el");
      const groupTitle =
        list.groupId === null
          ? "χωρίς ομάδα"
          : (listGroupTitleById.get(list.groupId) || "").toLocaleLowerCase("el");

      return title.includes(q) || groupTitle.includes(q);
    });
  }, [availableLists, listGroupTitleById, listPickerQuery]);

  async function loadAvailableLists() {
    setListPickerLoading(true);
    setListPickerError(null);

    try {
      const res = await fetch(
        `/api/lists?page=1&pageSize=200&songId=${encodeURIComponent(String(song.id))}`,
        { cache: "no-store" },
      );
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
      const groupsRaw =
        data && typeof data === "object" && Array.isArray((data as any).groups)
          ? ((data as any).groups as ListGroupOption[])
          : [];

      setAvailableLists(sortListsForPicker(itemsRaw));
      setAvailableListGroups(sortGroupsForPicker(groupsRaw));
    } catch (e: any) {
      setAvailableLists([]);
      setAvailableListGroups([]);
      setListPickerError(String(e?.message || e || "Αποτυχία φόρτωσης λιστών."));
    } finally {
      setListPickerLoading(false);
    }
  }

  function buildInitialListPickerToneSelection(): ListItemToneValue {
    let selectedTonicity = effectiveUrlTonicity;
    const selectedSingerTuneId = toNullablePositiveInt(effectiveSelectedSingerTuneId);

    if (typeof window !== "undefined") {
      const raw = (window as any).__repSelectedTonicity;
      if (typeof raw === "string" && raw.trim()) {
        selectedTonicity = raw.trim();
      }
    }

    const hasExplicitTune = nullableText(selectedTonicity) !== null || selectedSingerTuneId !== null;

    return {
      selectedTonicity: nullableText(selectedTonicity),
      selectedTonicitySign:
        hasExplicitTune
          ? nullableSign(effectiveUrlTonicitySign) ?? nullableSign(song.originalKeySign)
          : nullableSign(effectiveUrlTonicitySign),
      selectedSingerTuneId,
      selectedSingerTuneTitle: null,
      selectedSingerTuneTune: null,
    };
  }

  function openListPicker() {
    setListPickerToneSelection(buildInitialListPickerToneSelection());
    setListPickerToneByListId({});
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

  async function handleCreateList(input: {
    title: string;
    groupId: number | null;
    marked: boolean;
  }): Promise<SongListOption> {
    const title = input.title.trim();
    if (!title) throw new Error("Ο τίτλος λίστας είναι υποχρεωτικός.");

    setListPickerError(null);

    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        title,
        groupId: input.groupId,
        marked: input.marked,
      }),
    });

    const body = await readJson(res);

    if (!res.ok) {
      const msg = (body as any)?.error || (body as any)?.message || `Αποτυχία δημιουργίας λίστας (HTTP ${res.status})`;
      throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }

    const raw = (body as any)?.list ?? body;
    const id = Number((raw as any)?.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("Η δημιουργία λίστας δεν επέστρεψε έγκυρο id.");
    }

    const list: SongListOption = {
      id,
      title: normalizeListTitle(raw as Partial<SongListOption>) || title,
      groupId: toNullablePositiveInt((raw as any)?.groupId, input.groupId),
      marked: Boolean((raw as any)?.marked ?? input.marked),
      role: ((raw as any)?.role as SongListOption["role"]) || "OWNER",
      itemsCount: Number((raw as any)?.itemsCount ?? 0),
      containsSong: false,
      selected: false,
      isSelected: false,
    };

    setAvailableLists((prev) => sortListsForPicker([...prev.filter((x) => x.id !== id), list]));

    if (list.groupId !== null) {
      setAvailableListGroups((prev) =>
        sortGroupsForPicker(
          prev.map((group) =>
            group.id === list.groupId
              ? { ...group, listsCount: Number(group.listsCount ?? 0) + 1 }
              : group,
          ),
        ),
      );
    }

    return list;
  }

  async function handleAddSongToList(
    list: SongListOption,
    toneSelection: ListItemToneValue = buildInitialListPickerToneSelection(),
  ) {
    setListPickerSubmittingListId(list.id);
    setListPickerError(null);

    try {
      const res = await fetch(`/api/lists/${list.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songId: song.id,
          selectedTonicity: nullableText(toneSelection.selectedTonicity),
          selectedTonicitySign: nullableSign(toneSelection.selectedTonicitySign),
          selectedSingerTuneId: toNullablePositiveInt(toneSelection.selectedSingerTuneId),
        }),
      });

      const data = (await readJson(res)) as AddSongToListResponse | { error?: string } | null;

      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Αποτυχία προσθήκης του τραγουδιού στη λίστα.";
        throw new Error(msg);
      }

      const nextItemsCount =
        data && typeof data === "object" && typeof (data as any).itemsCount === "number"
          ? Number((data as any).itemsCount)
          : list.itemsCount + 1;
      const selectedListBase = listWithToneSelection(list, {
        selectedTonicity:
          data && typeof data === "object"
            ? nullableText((data as any).selectedTonicity) ?? toneSelection.selectedTonicity
            : toneSelection.selectedTonicity,
        selectedTonicitySign:
          data && typeof data === "object"
            ? nullableSign((data as any).selectedTonicitySign) ?? toneSelection.selectedTonicitySign
            : toneSelection.selectedTonicitySign,
        selectedSingerTuneId:
          data && typeof data === "object"
            ? toNullablePositiveInt(
                (data as any).selectedSingerTuneId,
                toneSelection.selectedSingerTuneId ?? null,
              )
            : toneSelection.selectedSingerTuneId,
        selectedSingerTuneTitle:
          data && typeof data === "object"
            ? nullableText((data as any).selectedSingerTuneTitle) ?? toneSelection.selectedSingerTuneTitle
            : toneSelection.selectedSingerTuneTitle,
        selectedSingerTuneTune:
          data && typeof data === "object"
            ? nullableText((data as any).selectedSingerTuneTune) ?? toneSelection.selectedSingerTuneTune
            : toneSelection.selectedSingerTuneTune,
      });
      const selectedList = {
        ...selectedListBase,
        listItemId:
          data && typeof data === "object"
            ? toNullablePositiveInt((data as any).listItemId, selectedListBase.listItemId ?? null)
            : selectedListBase.listItemId ?? null,
        itemsCount: nextItemsCount,
        containsSong: true,
        selected: true,
        isSelected: true,
      };

      setAvailableLists((prev) => {
        let found = false;

        const next = prev.map((x) => {
          if (x.id !== list.id) return x;
          found = true;
          return { ...x, ...selectedList };
        });

        return sortListsForPicker(found ? next : [...next, selectedList]);
      });

      setListPickerToneByListId((prev) => ({
        ...prev,
        [list.id]: toneValueFromListSelection(selectedList),
      }));
      setLastAddedList(selectedList);
      setLastSelectedListId(list.id);

      try {
        window.localStorage.setItem(LIST_PICKER_LAST_SELECTED_STORAGE_KEY, String(list.id));
      } catch {}

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

  async function handleListPickerToneSelectionChange(
    list: SongListOption,
    nextValue: ListItemToneValue,
  ) {
    if (!isListAlreadySelected(list)) {
      setListPickerToneByListId((prev) => ({
        ...prev,
        [list.id]: nextValue,
      }));
      return;
    }

    const listItemId = toNullablePositiveInt(list.listItemId);
    if (!listItemId) {
      setListPickerError("Δεν βρέθηκε το item της λίστας για ενημέρωση τόνου/φωνής.");
      return;
    }

    setListPickerSubmittingListId(list.id);
    setListPickerError(null);

    try {
      const res = await fetch(`/api/lists/${list.id}/items/${listItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          selectedTonicity: nullableText(nextValue.selectedTonicity),
          selectedTonicitySign: nullableSign(nextValue.selectedTonicitySign),
          selectedSingerTuneId: toNullablePositiveInt(nextValue.selectedSingerTuneId),
        }),
      });

      const data = (await readJson(res)) as AddSongToListResponse | { error?: string } | null;

      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Αποτυχία αποθήκευσης τόνου/φωνής στη λίστα.";
        throw new Error(msg);
      }

      const storedToneValue: ListItemToneValue = {
        selectedTonicity:
          data && typeof data === "object"
            ? nullableText((data as any).selectedTonicity) ?? nextValue.selectedTonicity
            : nextValue.selectedTonicity,
        selectedTonicitySign:
          data && typeof data === "object"
            ? nullableSign((data as any).selectedTonicitySign) ?? nextValue.selectedTonicitySign
            : nextValue.selectedTonicitySign,
        selectedSingerTuneId:
          data && typeof data === "object"
            ? toNullablePositiveInt(
                (data as any).selectedSingerTuneId,
                nextValue.selectedSingerTuneId ?? null,
              )
            : nextValue.selectedSingerTuneId,
        selectedSingerTuneTitle:
          data && typeof data === "object"
            ? nullableText((data as any).selectedSingerTuneTitle) ??
              nextValue.selectedSingerTuneTitle
            : nextValue.selectedSingerTuneTitle,
        selectedSingerTuneTune:
          data && typeof data === "object"
            ? nullableText((data as any).selectedSingerTuneTune) ??
              nextValue.selectedSingerTuneTune
            : nextValue.selectedSingerTuneTune,
      };

      setAvailableLists((prev) =>
        sortListsForPicker(
          prev.map((item) =>
            item.id === list.id ? listWithToneSelection(item, storedToneValue) : item,
          ),
        ),
      );
      setListPickerToneByListId((prev) => ({
        ...prev,
        [list.id]: storedToneValue,
      }));
    } catch (e: any) {
      setListPickerError(
        String(e?.message || e || "Αποτυχία αποθήκευσης τόνου/φωνής στη λίστα."),
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

  function sendCurrentSongToRoom() {
    if (typeof window === "undefined") return;
    const w = window as any;

    if (typeof w.RepRoomsSendSong !== "function") {
      alert("Το σύστημα rooms δεν είναι διαθέσιμο.");
      return;
    }

    const selectedTonicity =
      typeof w.__repSelectedTonicity === "string" ? w.__repSelectedTonicity : null;

    const sent = w.RepRoomsSendSong(window.location.href, song.title, song.id, selectedTonicity);
    if (sent === true) {
      setRoomSendConfirmed(true);
      if (roomSendFlashTimerRef.current) clearTimeout(roomSendFlashTimerRef.current);
      roomSendFlashTimerRef.current = setTimeout(() => {
        setRoomSendConfirmed(false);
        roomSendFlashTimerRef.current = null;
      }, ROOM_SENT_FLASH_MS);
    }
  }

  const roomAction = A.room({
    onClick: sendCurrentSongToRoom,
    title: roomSendConfirmed ? "Στάλθηκε στο Room" : "Αποστολή στο Room",
    label: roomSendConfirmed ? "Στάλθηκε" : "Room",
    action: roomSendConfirmed ? "apply" : "room",
  });

  function openYoutube() {
    if (!safeYoutubeUrl || typeof window === "undefined") return;
    window.open(safeYoutubeUrl, "_blank", "noopener,noreferrer");
  }

  const backHref = useMemo(() => {
    if (hasListContext) return `/lists/${listId}`;

    const qs = sp.toString();
    return qs ? `/songs?${qs}` : "/songs";
  }, [hasListContext, listId, sp]);

  const backLabel = hasListContext ? "Λίστα" : "Τραγούδια";
  const backTitle = hasListContext ? "Επιστροφή στη λίστα" : "Επιστροφή στα φιλτραρισμένα τραγούδια";

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
    } catch {}
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

    e.stopPropagation();
    // On desktop, cancelling pointerdown can suppress the button's native click event.
    if (e.pointerType !== "mouse") e.preventDefault();
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
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    sendCurrentSongToRoom();
  }

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

  const swipeIsActive = swipeDragging || swipeSettling || Math.abs(swipeOffsetX) > 0.5;

  function renderAdjacentSongSurface(direction: "prev" | "next", viewSong: SongDetail) {
    const pos = direction === "next" ? listNav?.nextPos : listNav?.prevPos;
    const viewNav = listNavForPos(pos);
    const viewItem = pos !== null && pos !== undefined ? listNavItems?.[pos] || null : null;
    const viewAssets: any[] = Array.isArray((viewSong as any).assets) ? (viewSong as any).assets : [];
    const viewHasAssets = viewAssets.length > 0;
    const viewHasScores =
      Boolean((viewSong as any).hasScore) || viewAssets.some((asset) => isMxlScoreAsset(asset));
    const viewHasChords = Boolean(viewSong.chords && viewSong.chords.trim() !== "");
    const viewYoutubeUrl = youtubeUrlForSong(viewSong);
    const viewSafeYoutubeUrl = isSafeExternalHttpUrl(viewYoutubeUrl) ? viewYoutubeUrl : "";
    const viewFinalLyrics = finalLyricsForSong(viewSong);
    const viewSelectedTonicity = viewItem?.selectedTonicity || null;
    const viewSelectedTonicitySign = viewItem?.selectedTonicitySign || null;
    const viewSelectedSingerTuneId = viewItem?.selectedSingerTuneId || null;
    const noop = () => {};

    return (
      <div
        style={{
          background: "#000",
          minHeight: "100%",
          paddingBottom: 28,
        }}
      >
        <ActionBar
          left={<>{A.backLink({ href: backHref, title: backTitle, label: backLabel })}</>}
          right={
            <>
              {viewSafeYoutubeUrl ? (
                <YouTubeActionButton onClick={noop} disabled />
              ) : null}

              <Button
                type="button"
                variant="secondary"
                onClick={noop}
                title="Προσθήκη του τραγουδιού σε λίστα"
                aria-label="Προσθήκη του τραγουδιού σε λίστα"
                icon={ListMusic}
              >
                Σε λίστα
              </Button>

              {A.help({ title: "Βοήθεια", label: "Βοήθεια", onClick: noop })}
              {A.share({ shareTitle: viewSong.title, label: "Share" })}

              {canEdit
                ? A.editLink({
                    href: `/songs/${viewSong.id}/edit`,
                    title: "Επεξεργασία τραγουδιού",
                    label: "Επεξεργασία",
                  })
                : null}
            </>
          }
        />

        <header style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <h1
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {viewSong.title}
            </h1>

            {viewSong.rythmTitle ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: "0.9rem",
                  lineHeight: 1.1,
                  color: "#aaa",
                }}
              >
                {viewSong.rythmTitle}
              </div>
            ) : null}
          </div>

          {viewNav ? (
            <div
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
                onClick={noop}
                disabled={!viewNav.prevSongId || viewNav.prevPos === null}
                title="Προηγούμενο τραγούδι"
                aria-label="Προηγούμενο τραγούδι"
                icon={ChevronLeft}
              />

              <Button
                type="button"
                variant="secondary"
                onClick={noop}
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
                {viewNav.curPos + 1} / {listSongIds?.length ?? 0}
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={noop}
                disabled={!viewNav.nextSongId || viewNav.nextPos === null}
                title="Επόμενο τραγούδι"
                aria-label="Επόμενο τραγούδι"
                icon={ChevronRight}
              />
            </div>
          ) : null}
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 14 }}>
          <span style={{ display: "inline-flex" }}>
            <Button
              type="button"
              variant={panels.singerTunes ? "primary" : "secondary"}
              onClick={noop}
              title={panels.singerTunes ? "Απόκρυψη τονικοτήτων" : "Εμφάνιση τονικοτήτων"}
              aria-pressed={panels.singerTunes}
              icon={Mic}
            >
              Tunes
            </Button>
          </span>

          <span style={{ display: "inline-flex" }}>
            <Button
              type="button"
              variant={panels.info ? "primary" : "secondary"}
              onClick={noop}
              title={panels.info ? "Απόκρυψη πληροφοριών" : "Εμφάνιση πληροφοριών"}
              aria-pressed={panels.info}
              icon={Info}
            >
              Info
            </Button>
          </span>

          <span style={{ display: "inline-flex" }}>
            <Button
              type="button"
              variant={panels.chords ? "primary" : "secondary"}
              onClick={noop}
              title={
                !viewHasChords
                  ? "Δεν υπάρχουν ακόρντα για αυτό το τραγούδι"
                  : panels.chords
                    ? "Απόκρυψη ακόρντων"
                    : "Εμφάνιση ακόρντων"
              }
              aria-pressed={panels.chords}
              icon={Guitar}
              disabled={!viewHasChords}
            >
              Chords
            </Button>
          </span>

          <span style={{ display: "inline-flex" }}>
            <Button
              type="button"
              variant={panels.scores ? "primary" : "secondary"}
              onClick={noop}
              title={
                !viewHasScores
                  ? "Δεν υπάρχει παρτιτούρα MXL για αυτό το τραγούδι"
                  : panels.scores
                    ? "Απόκρυψη παρτιτούρας"
                    : "Εμφάνιση παρτιτούρας"
              }
              aria-pressed={panels.scores}
              icon={Music}
              disabled={!viewHasScores}
            >
              Scores
            </Button>
          </span>

          <SongAssetsPanel
            open={panels.assets}
            hasAssets={viewHasAssets}
            assets={viewAssets}
            onToggle={noop}
          />
        </div>

        {viewSong.tags.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {viewSong.tags.map((tag) => (
              <span
                key={tag.id}
                style={{
                  padding: "4px 10px",
                  borderRadius: 99,
                  border: "1px solid #333",
                  background: "#111",
                  fontSize: 14,
                }}
                title={tag.slug ? `slug: ${tag.slug}` : undefined}
              >
                #{tag.title}
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
          songTitle={viewSong.title}
          categoryTitle={viewSong.categoryTitle}
          composerName={viewSong.composerName}
          lyricistName={viewSong.lyricistName}
          rythmTitle={viewSong.rythmTitle}
          basedOnSongTitle={viewSong.basedOnSongTitle}
          basedOnSongId={viewSong.basedOnSongId}
          characteristics={viewSong.characteristics}
          views={viewSong.views}
          createdByUserId={viewSong.createdByUserId}
          createdByDisplayName={viewSong.createdByDisplayName}
          status={viewSong.status}
          versions={viewSong.versions}
        />

        <SongSingerTunesClient
          open={panels.singerTunes}
          songId={viewSong.id}
          originalKeySign={viewSong.originalKeySign}
          selectedSingerTuneId={viewSelectedSingerTuneId}
          selectedTonicity={viewSelectedTonicity}
          selectedTonicitySign={viewSelectedTonicitySign}
        />

        {viewHasChords && panels.chords ? (
          <section style={{ marginTop: 0, marginBottom: 0 }}>
            <SongChordsClient
              songId={viewSong.id}
              chords={viewSong.chords}
              originalKey={viewSong.originalKey}
              originalKeySign={viewSong.originalKeySign}
              urlTonicity={viewSelectedTonicity}
              urlTonicitySign={viewSelectedTonicitySign}
            />
          </section>
        ) : null}

        <section style={{ marginTop: 0, marginBottom: 24 }}>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              padding: "6px 10px",
              margin: 0,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#0b0b0b",
              fontSize: Math.round(LYRICS_BASE_FONT_SIZE * lyricsScale),
              lineHeight: 1.12,
              touchAction: "pan-y",
              WebkitTextSizeAdjust: "100%",
            }}
          >
            {viewFinalLyrics}
          </pre>
        </section>

        <SongScoresPanel open={panels.scores} assets={viewAssets} />
      </div>
    );
  }

  function renderAdjacentLayer(direction: "prev" | "next", viewSong: SongDetail | null) {
    if (!viewSong) return null;

    const sideTransform =
      direction === "next"
        ? `translate3d(calc(100% + ${swipeOffsetX}px), 0, 0)`
        : `translate3d(calc(-100% + ${swipeOffsetX}px), 0, 0)`;

    return (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          visibility: swipeIsActive ? "visible" : "hidden",
          transform: sideTransform,
          transition: swipeDragging
            ? "none"
            : `transform ${LIST_SWIPE_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          willChange: swipeIsActive ? "transform" : undefined,
        }}
      >
        {renderAdjacentSongSurface(direction, viewSong)}
      </div>
    );
  }

  return (
    <section
      ref={swipeViewportRef}
      style={{
        padding: "0px 10px",
        maxWidth: 900,
        margin: "0 auto",
        touchAction: "pan-y",
        position: "relative",
        overflowX: "clip",
        overflowY: "visible",
        isolation: "isolate",
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={cancelSwipeGesture}
      onPointerDown={onPointerDownSection}
      onPointerMove={onPointerMoveSection}
      onPointerUp={onPointerUpSection}
      onPointerCancel={cancelSwipeGesture}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "#000",
          transform: swipeIsActive ? `translate3d(${swipeOffsetX}px, 0, 0)` : undefined,
          transition: swipeDragging
            ? "none"
            : `transform ${LIST_SWIPE_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          willChange: swipeIsActive ? "transform" : undefined,
        }}
      >
      <ActionBar
        left={<>{A.backLink({ href: backHref, title: backTitle, label: backLabel })}</>}
        right={
          <>
            {safeYoutubeUrl ? (
              <YouTubeActionButton onClick={openYoutube} />
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

      <SongListPickerModal
        open={listPickerOpen}
        songId={song.id}
        songTitle={song.title}
        songOriginalKey={song.originalKey}
        songOriginalKeySign={song.originalKeySign}
        defaultToneSelection={listPickerToneSelection}
        listToneSelections={listPickerToneByListId}
        onListToneSelectionChange={handleListPickerToneSelectionChange}
        query={listPickerQuery}
        onQueryChange={setListPickerQuery}
        loading={listPickerLoading}
        error={listPickerError}
        availableLists={availableLists}
        availableGroups={availableListGroups}
        filteredLists={filteredLists}
        lastSelectedListId={lastSelectedListId}
        submittingListId={listPickerSubmittingListId}
        onClose={closeListPicker}
        onSelectList={handleAddSongToList}
        onCreateList={handleCreateList}
        normalizeListTitle={normalizeListTitle}
      />

      <header id="song-title" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <h1
            style={{
              fontSize: "1.8rem",
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {song.title}
          </h1>

          {song.rythmTitle ? (
            <div
              style={{
                marginTop: 4,
                fontSize: "0.9rem",
                lineHeight: 1.1,
                color: "#aaa",
              }}
            >
              {song.rythmTitle}
            </div>
          ) : null}
        </div>

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
                ? "Δεν υπάρχει παρτιτούρα MXL για αυτό το τραγούδι"
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
        selectedSingerTuneId={effectiveSelectedSingerTuneId}
        selectedTonicity={effectiveUrlTonicity}
        selectedTonicitySign={effectiveUrlTonicitySign}
      />

      {hasChords && panels.chords ? (
        <section id="song-chords" style={{ marginTop: 0, marginBottom: 0 }}>
          <SongChordsClient
            songId={song.id}
            chords={song.chords}
            originalKey={song.originalKey}
            originalKeySign={song.originalKeySign}
            urlTonicity={effectiveUrlTonicity}
            urlTonicitySign={effectiveUrlTonicitySign}
          />
        </section>
      ) : null}

      <section id="song-lyrics" style={{ marginTop: 0, marginBottom: 24 }}>
        <pre
          data-tour="lyrics-zoom"
          ref={lyricsPreRef}
          style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            padding: "6px 10px",
            margin: 0,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#0b0b0b",
            fontSize: Math.round(LYRICS_BASE_FONT_SIZE * lyricsScale),
            lineHeight: 1.12,
            touchAction: "pan-y",
            WebkitTextSizeAdjust: "100%",
          }}
        >
          {finalLyrics}
        </pre>
      </section>

      <SongScoresPanel open={panels.scores} assets={(song as any).assets ?? []} />

      {schemaNode}
      </div>

      {renderAdjacentLayer("prev", adjacentSongs.prev)}
      {renderAdjacentLayer("next", adjacentSongs.next)}

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
          touchAction: "none",
        }}
      >
        {roomAction}
      </div>
    </section>
  );
}
