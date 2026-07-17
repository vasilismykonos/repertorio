// apps/web/app/lists/[id]/ListDetailClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";
import ListItemTonePicker, {
  normalizeTonicitySign,
  type ListItemSingerSuggestion,
  type ListItemToneValue,
} from "@/app/components/ListItemTonePicker";

import type { ListDetailDto } from "./page";

import { Copy, Crown, Download, Eye, Link2, LogOut, Music2, Printer, Shield, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

type Role = ListDetailDto["role"];

const LAST_VIEWED_LIST_KEY = "repertorio:lastViewedListId";
const RECENT_LISTS_KEY = "repertorio:recentListIds";
const RECENT_GROUPS_KEY = "repertorio:recentGroupIds";
const LIST_SONG_PREVIEW_MEDIA_QUERY = "(min-width: 769px)";

type Props = {
  listId: number;
  viewerUserId: number;
  data: ListDetailDto;
};

type ListItemRow = ListDetailDto["items"][number];
type ShareLinkRole = "VIEWER" | "SONGS_EDITOR";

function navigateDocumentWhenOffline(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (typeof window === "undefined" || typeof navigator === "undefined" || navigator.onLine !== false) return;
  event.preventDefault();
  window.location.href = href;
}

function canUseListSongPreview() {
  return typeof window !== "undefined" && window.matchMedia(LIST_SONG_PREVIEW_MEDIA_QUERY).matches;
}

function songPreviewHref(href: string) {
  return `${href}${href.includes("?") ? "&" : "?"}embed=1&listPreview=1`;
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function normalizeListItemTags(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of source) {
    const tag = String(item ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!tag) continue;

    const key = tag.toLocaleLowerCase("el");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag.slice(0, 48));
    if (out.length >= 12) break;
  }

  return out;
}

function tagKey(value: string) {
  return String(value ?? "").trim().toLocaleLowerCase("el");
}

function lyricsPreviewText(value: unknown): string | null {
  const text = nullableText(value);
  if (!text) return null;

  const line = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .find((part) => part && !part.startsWith("[") && !part.startsWith("{"));

  if (!line) return null;
  return line.length > 96 ? `${line.slice(0, 93).trimEnd()}...` : line;
}

function isListRowInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("a, button, input, textarea, select, summary, [role='button'], [data-no-row-open='true']"),
  );
}

function nullablePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeSuggestionTitle(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("el");
}

function readJsonResponse(res: Response): Promise<any> {
  return res.text().then((text) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  });
}

function toneValueFromItem(item: any): ListItemToneValue {
  return {
    selectedTonicity: nullableText(item?.selectedTonicity),
    selectedTonicitySign: normalizeTonicitySign(item?.selectedTonicitySign),
    selectedSingerTuneId: nullablePositiveInt(item?.selectedSingerTuneId),
    selectedSingerTuneTitle: nullableText(item?.selectedSingerTuneTitle),
    selectedSingerTuneTune: nullableText(item?.selectedSingerTuneTune),
  };
}

function withToneValue(item: ListItemRow, nextTone: ListItemToneValue, saved?: any): ListItemRow {
  return {
    ...item,
    selectedTonicity: nullableText(saved?.selectedTonicity) ?? nullableText(nextTone.selectedTonicity),
    selectedTonicitySign:
      normalizeTonicitySign(saved?.selectedTonicitySign) ?? normalizeTonicitySign(nextTone.selectedTonicitySign),
    selectedSingerTuneId:
      nullablePositiveInt(saved?.selectedSingerTuneId) ?? nullablePositiveInt(nextTone.selectedSingerTuneId),
    selectedSingerTuneTitle:
      nullableText(saved?.selectedSingerTuneTitle) ?? nullableText(nextTone.selectedSingerTuneTitle),
    selectedSingerTuneTune:
      nullableText(saved?.selectedSingerTuneTune) ?? nullableText(nextTone.selectedSingerTuneTune),
  };
}

function groupIdValue(value: any): number | null {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function rememberRecentGroup(id: any) {
  const groupId = groupIdValue(id);
  if (!groupId || typeof window === "undefined") return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_GROUPS_KEY) || "[]");
    const ids = Array.isArray(parsed) ? parsed : [];
    const next = [groupId, ...ids.filter((item: any) => groupIdValue(item) !== groupId)]
      .map(groupIdValue)
      .filter((item): item is number => Boolean(item))
      .slice(0, 20);
    window.localStorage.setItem(RECENT_GROUPS_KEY, JSON.stringify(next));
  } catch {
    // Best-effort preference only.
  }
}

function listIdValue(value: any): number | null {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function rememberRecentList(id: any) {
  const listId = listIdValue(id);
  if (!listId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_VIEWED_LIST_KEY, String(listId));
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_LISTS_KEY) || "[]");
    const ids = Array.isArray(parsed) ? parsed : [];
    const next = [listId, ...ids.filter((item: any) => listIdValue(item) !== listId)]
      .map(listIdValue)
      .filter((item): item is number => Boolean(item))
      .slice(0, 20);
    window.localStorage.setItem(RECENT_LISTS_KEY, JSON.stringify(next));
  } catch {
    // Best-effort preference only.
  }
}

function roleLabel(role: Role) {
  if (role === "ADMIN") return "Προβολή ως admin";
  if (role === "OWNER") return "Δημιουργός";
  if (role === "LIST_EDITOR") return "Διαχειριστής";
  if (role === "SONGS_EDITOR") return "Συντάκτης";
  return "Χρήστης";
}

function roleHint(role: Role) {
  if (role === "ADMIN") return "Βλέπετε αυτή τη λίστα με δικαίωμα διαχειριστή, χωρίς να είστε μέλος.";
  if (role === "OWNER") return "Ορίζει δικαιώματα και διαχειρίζεται τη λίστα.";
  if (role === "LIST_EDITOR") return "Μπορεί να αλλάζει ρυθμίσεις/τίτλο και να διαχειρίζεται μέλη.";
  if (role === "SONGS_EDITOR") return "Μπορεί να επεξεργάζεται μόνο τα τραγούδια της λίστας.";
  return "Μπορεί να βλέπει τη λίστα.";
}

function roleIcon(role: Role): React.ReactNode {
  if (role === "ADMIN") return <Shield size={14} />;
  if (role === "OWNER") return <Crown size={14} />;
  if (role === "LIST_EDITOR") return <Shield size={14} />;
  if (role === "SONGS_EDITOR") return <Music2 size={14} />;
  return <Eye size={14} />;
}

type RoleTone = "gold" | "blue" | "violet" | "gray";

function roleTone(role: Role): RoleTone {
  if (role === "ADMIN") return "blue";
  if (role === "OWNER") return "gold";
  if (role === "LIST_EDITOR") return "blue";
  if (role === "SONGS_EDITOR") return "violet";
  return "gray";
}

function roleBadgeStyle(role: Role): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
    lineHeight: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  };

  const tone = roleTone(role);

  if (tone === "gold") {
    return {
      ...base,
      border: "1px solid rgba(255,215,120,0.45)",
      background: "rgba(255,215,120,0.12)",
    };
  }

  if (tone === "blue") {
    return {
      ...base,
      border: "1px solid rgba(120,185,255,0.40)",
      background: "rgba(120,185,255,0.10)",
    };
  }

  if (tone === "violet") {
    return {
      ...base,
      border: "1px solid rgba(190,140,255,0.40)",
      background: "rgba(190,140,255,0.10)",
    };
  }

  return {
    ...base,
    border: "1px solid rgba(255,255,255,0.26)",
    background: "rgba(255,255,255,0.06)",
  };
}

type PrintableListRow = {
  number: string;
  title: string;
  selection: string | null;
};

function safeFilenamePart(value: string) {
  return String(value || "list")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "list";
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.92));
}

export default function ListDetailClient({ listId, viewerUserId, data }: Props) {
  void viewerUserId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [shareLinkRole, setShareLinkRole] = useState<ShareLinkRole>("VIEWER");
  const [shareLinkBusy, setShareLinkBusy] = useState(false);
  const [shareLinkError, setShareLinkError] = useState<string | null>(null);
  const [shareLinkUrl, setShareLinkUrl] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [selectedPreviewListItemId, setSelectedPreviewListItemId] = useState<number | null>(null);
  const [items, setItems] = useState<ListItemRow[]>(() => data.items ?? []);
  const [activeItemTag, setActiveItemTag] = useState<string | null>(null);
  const [toneSavingListItemId, setToneSavingListItemId] = useState<number | null>(null);
  const [toneStatus, setToneStatus] = useState<string | null>(null);

  useEffect(() => {
    setItems(data.items ?? []);
  }, [data.items]);

  useEffect(() => {
    rememberRecentList(listId);
    const ids = Array.isArray((data as any)?.groupIds) && (data as any).groupIds.length
      ? (data as any).groupIds
      : [data?.groupId];
    for (const id of ids) rememberRecentGroup(id);
  }, [listId, data]);

  const { title, groupTitle, marked, role } = data;
  const groupLabels = useMemo(() => {
    const source = Array.isArray((data as any)?.groups) ? (data as any).groups : [];
    const labels = source
      .map((group: any) => String(group?.fullTitle || group?.title || "").trim())
      .filter(Boolean);
    if (!labels.length && groupTitle) labels.push(groupTitle);
    return [...new Set(labels)];
  }, [data, groupTitle]);
  const groupMetaLabel = groupLabels.length ? `Tags: ${groupLabels.join(", ")}` : "";

  const allItemTags = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const item of items ?? []) {
      for (const tag of normalizeListItemTags((item as any).tags)) {
        const key = tagKey(tag);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
      }
    }

    return out.sort((a, b) => a.localeCompare(b, "el", { sensitivity: "base" }));
  }, [items]);

  useEffect(() => {
    if (!activeItemTag) return;
    const activeKey = tagKey(activeItemTag);
    if (!allItemTags.some((tag) => tagKey(tag) === activeKey)) setActiveItemTag(null);
  }, [activeItemTag, allItemTags]);

  const visibleItems = useMemo(() => {
    if (!activeItemTag) return items;
    const activeKey = tagKey(activeItemTag);
    return (items ?? []).filter((item: any) =>
      normalizeListItemTags(item?.tags).some((tag) => tagKey(tag) === activeKey),
    );
  }, [items, activeItemTag]);

  const isAdminView = role === "ADMIN" || Boolean((data as any).adminView);
  const canEdit = isAdminView || role === "OWNER" || role === "LIST_EDITOR" || role === "SONGS_EDITOR";
  const canShareList = isAdminView || role === "OWNER" || role === "LIST_EDITOR";
  const canLeaveList = !isAdminView && role !== "OWNER" && Number(viewerUserId) > 0;
  const headerTitle = title || `Λίστα #${listId}`;

  const singerSuggestions = useMemo<ListItemSingerSuggestion[]>(() => {
    const seen = new Set<string>();
    const out: ListItemSingerSuggestion[] = [];

    for (const item of items ?? []) {
      const title = nullableText((item as any).selectedSingerTuneTitle);
      if (!title) continue;

      const key = normalizeSuggestionTitle(title);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        title,
        tune: nullableText((item as any).selectedSingerTuneTune) ?? nullableText((item as any).selectedTonicity),
        singerTuneId: nullablePositiveInt((item as any).selectedSingerTuneId),
      });
    }

    return out.slice(0, 8);
  }, [items]);

  async function updateItemTone(listItemId: number, nextTone: ListItemToneValue) {
    if (!canEdit || toneSavingListItemId !== null) return;

    const previousItems = items;
    setToneStatus(null);
    setToneSavingListItemId(listItemId);
    setItems((prev) =>
      prev.map((item) => (Number((item as any).listItemId) === listItemId ? withToneValue(item, nextTone) : item)),
    );

    try {
      const res = await fetch(`/api/lists/${listId}/items/${listItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          selectedTonicity: nullableText(nextTone.selectedTonicity),
          selectedTonicitySign: normalizeTonicitySign(nextTone.selectedTonicitySign),
          selectedSingerTuneId: nullablePositiveInt(nextTone.selectedSingerTuneId),
        }),
        cache: "no-store",
      });
      const body = await readJsonResponse(res);

      if (!res.ok) {
        const message = body?.error || body?.message || `HTTP ${res.status}`;
        throw new Error(String(message));
      }

      const saved = body?.item ?? body?.data ?? body;
      setItems((prev) =>
        prev.map((item) =>
          Number((item as any).listItemId) === listItemId ? withToneValue(item, nextTone, saved) : item,
        ),
      );
      setToneStatus("Η τονικότητα αποθηκεύτηκε.");
      window.setTimeout(() => setToneStatus(null), 2200);
    } catch (e: any) {
      setItems(previousItems);
      setToneStatus(e?.message ? `Σφάλμα: ${e.message}` : "Σφάλμα αποθήκευσης τονικότητας.");
    } finally {
      setToneSavingListItemId(null);
    }
  }

  const printRows = useMemo<PrintableListRow[]>(
    () =>
      (items ?? []).map((item: any, index) => {
        const listItemId = Number(item.listItemId);
        const sortId = item.sortId ?? index + 1;
        const titleText = item.title || `(αντικείμενο #${listItemId})`;
        const selectedTonicity = typeof item.selectedTonicity === "string" && item.selectedTonicity.trim()
          ? item.selectedTonicity.trim()
          : null;
        const selectedTonicitySign = item.selectedTonicitySign === "+" || item.selectedTonicitySign === "-"
          ? item.selectedTonicitySign
          : "";
        const selectedSingerTuneTitle =
          typeof item.selectedSingerTuneTitle === "string" && item.selectedSingerTuneTitle.trim()
            ? item.selectedSingerTuneTitle.trim()
            : null;
        const tonicityLabel = selectedTonicity ? `${selectedTonicity}${selectedTonicitySign}` : null;
        const selection = selectedSingerTuneTitle
          ? `${selectedSingerTuneTitle}${tonicityLabel ? ` · ${tonicityLabel}` : ""}`
          : tonicityLabel;

        return {
          number: sortId ? `${sortId}.` : `${index + 1}.`,
          title: titleText,
          selection,
        };
      }),
    [items],
  );

  const songIdByListItemId = useMemo(() => {
    const map = new Map<
      number,
      {
        songId: number;
        pos: number;
        selectedTonicity: string | null;
        selectedTonicitySign: "+" | "-" | null;
        selectedSingerTuneId: number | null;
        selectedSingerTuneTitle: string | null;
      }
    >();
    let pos = 0;

    for (const it of items ?? []) {
      const sid = Number((it as any).songId);
      if (Number.isFinite(sid) && sid > 0) {
        const selectedSingerTuneId = Number((it as any).selectedSingerTuneId || 0);
        map.set(Number((it as any).listItemId), {
          songId: sid,
          pos,
          selectedTonicity:
            typeof (it as any).selectedTonicity === "string" && (it as any).selectedTonicity.trim()
              ? (it as any).selectedTonicity.trim()
              : null,
          selectedTonicitySign:
            (it as any).selectedTonicitySign === "+" || (it as any).selectedTonicitySign === "-"
              ? (it as any).selectedTonicitySign
              : null,
          selectedSingerTuneId:
            Number.isFinite(selectedSingerTuneId) && selectedSingerTuneId > 0
              ? selectedSingerTuneId
              : null,
          selectedSingerTuneTitle:
            typeof (it as any).selectedSingerTuneTitle === "string" && (it as any).selectedSingerTuneTitle.trim()
              ? (it as any).selectedSingerTuneTitle.trim()
              : null,
        });
        pos += 1;
      }
    }

    return map;
  }, [items]);

  const buildSongHref = useCallback((info: {
    songId: number;
    pos: number;
    selectedTonicity: string | null;
    selectedTonicitySign: "+" | "-" | null;
    selectedSingerTuneId: number | null;
  }) => {
    const params = new URLSearchParams({
      listId: String(listId),
      listPos: String(info.pos),
    });

    if (info.selectedTonicity) params.set("tonicity", info.selectedTonicity);
    if (info.selectedTonicitySign) params.set("tonicitySign", info.selectedTonicitySign);
    if (info.selectedSingerTuneId) params.set("singerTuneId", String(info.selectedSingerTuneId));

    return `/songs/${info.songId}?${params.toString()}`;
  }, [listId]);

  const songPreviewItems = useMemo(() => {
    const rows: Array<{
      listItemId: number;
      songId: number;
      pos: number;
      title: string;
      href: string;
      embedHref: string;
    }> = [];

    for (const item of items ?? []) {
      const listItemId = Number((item as any).listItemId);
      const info = songIdByListItemId.get(listItemId);
      if (!info?.songId) continue;

      const href = buildSongHref(info);
      rows.push({
        listItemId,
        songId: Number(info.songId),
        pos: info.pos,
        title: String((item as any).title || `Song #${info.songId}`),
        href,
        embedHref: songPreviewHref(href),
      });
    }

    return rows;
  }, [buildSongHref, items, songIdByListItemId]);

  const songPreviewByListItemId = useMemo(
    () => new Map(songPreviewItems.map((item) => [item.listItemId, item] as const)),
    [songPreviewItems],
  );

  const requestedPreviewItem = useMemo(() => {
    if (!songPreviewItems.length) return null;
    const raw = searchParams.get("pos") ?? searchParams.get("listPos") ?? "";
    const pos = Number(raw);
    if (Number.isFinite(pos) && pos >= 0) {
      return songPreviewItems.find((item) => item.pos === pos) ?? songPreviewItems[0];
    }
    return songPreviewItems[0];
  }, [searchParams, songPreviewItems]);

  useEffect(() => {
    if (!songPreviewItems.length) {
      setSelectedPreviewListItemId(null);
      return;
    }

    setSelectedPreviewListItemId((current) => {
      if (current && songPreviewByListItemId.has(current)) return current;
      return requestedPreviewItem?.listItemId ?? songPreviewItems[0]?.listItemId ?? null;
    });
  }, [requestedPreviewItem, songPreviewByListItemId, songPreviewItems]);

  const effectiveSelectedPreviewListItemId =
    selectedPreviewListItemId !== null && songPreviewByListItemId.has(selectedPreviewListItemId)
      ? selectedPreviewListItemId
      : requestedPreviewItem?.listItemId ?? songPreviewItems[0]?.listItemId ?? null;
  const selectedPreviewItem =
    effectiveSelectedPreviewListItemId !== null
      ? songPreviewByListItemId.get(effectiveSelectedPreviewListItemId) ?? null
      : null;

  function handleSongOpenInList(
    event: React.MouseEvent<HTMLAnchorElement>,
    previewItem: { listItemId: number; href: string },
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (canUseListSongPreview()) {
      event.preventDefault();
      setSelectedPreviewListItemId(previewItem.listItemId);
      return;
    }

    navigateDocumentWhenOffline(event, previewItem.href);
  }

  function handleSongRowOpen(
    event: React.MouseEvent<HTMLLIElement>,
    href: string,
    previewItem: { listItemId: number; href: string } | null,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      isListRowInteractiveTarget(event.target)
    ) {
      return;
    }

    if (previewItem && canUseListSongPreview()) {
      setSelectedPreviewListItemId(previewItem.listItemId);
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      window.location.href = href;
      return;
    }

    router.push(href);
  }

  function handlePrintPreview() {
    setPrintPreviewOpen(true);
    setShareStatus(null);
  }

  function handlePrint() {
    window.print();
  }

  async function handleShareImage() {
    setShareStatus("Δημιουργία εικόνας...");
    try {
      const width = 1080;
      const paddingX = 72;
      const topPadding = 64;
      const bottomPadding = 70;
      const titleSize = 46;
      const metaSize = 24;
      const rowTitleSize = 30;
      const rowMetaSize = 22;
      const lineGap = 10;
      const rowGap = 22;

      const measuringCanvas = document.createElement("canvas");
      const measureCtx = measuringCanvas.getContext("2d");
      if (!measureCtx) throw new Error("Canvas not supported");

      const usableWidth = width - paddingX * 2;
      measureCtx.font = `800 ${rowTitleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;

      const rowsLayout = printRows.map((row) => {
        const titleLines = wrapCanvasText(measureCtx, `${row.number} ${row.title}`, usableWidth);
        measureCtx.font = `600 ${rowMetaSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
        const selectionLines = row.selection ? wrapCanvasText(measureCtx, row.selection, usableWidth - 34) : [];
        measureCtx.font = `800 ${rowTitleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
        const height =
          titleLines.length * (rowTitleSize + 8) +
          (selectionLines.length ? 8 + selectionLines.length * (rowMetaSize + 6) : 0) +
          rowGap;
        return { row, titleLines, selectionLines, height };
      });

      const height = Math.max(
        620,
        topPadding + titleSize + 18 + metaSize + 42 + rowsLayout.reduce((sum, row) => sum + row.height, 0) + bottomPadding,
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#111827";
      ctx.font = `900 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText(headerTitle, paddingX, topPadding + titleSize);

      ctx.fillStyle = "#4b5563";
      ctx.font = `600 ${metaSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
      const metaParts = [
        `${printRows.length} τραγούδια`,
        groupMetaLabel,
      ].filter(Boolean);
      ctx.fillText(metaParts.join(" · "), paddingX, topPadding + titleSize + 42);

      let y = topPadding + titleSize + 92;
      for (const layout of rowsLayout) {
        ctx.fillStyle = "#111827";
        ctx.font = `800 ${rowTitleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
        for (const line of layout.titleLines) {
          ctx.fillText(line, paddingX, y);
          y += rowTitleSize + 8;
        }

        if (layout.selectionLines.length) {
          y += 4;
          ctx.fillStyle = "#4b5563";
          ctx.font = `600 ${rowMetaSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
          for (const line of layout.selectionLines) {
            ctx.fillText(line, paddingX + 34, y);
            y += rowMetaSize + 6;
          }
        }

        y += lineGap;
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(paddingX, y);
        ctx.lineTo(width - paddingX, y);
        ctx.stroke();
        y += rowGap;
      }

      ctx.fillStyle = "#6b7280";
      ctx.font = "600 20px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("Repertorio.net", paddingX, height - 36);

      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("Image creation failed");

      const filename = `${safeFilenamePart(headerTitle)}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };

      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          title: headerTitle,
          text: `${headerTitle} · ${printRows.length} τραγούδια`,
          files: [file],
        });
        setShareStatus("Κοινοποιήθηκε.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setShareStatus("Η εικόνα κατέβηκε στη συσκευή.");
    } catch (err: any) {
      setShareStatus(String(err?.message || err || "Δεν μπόρεσα να δημιουργήσω εικόνα."));
    }
  }

  function openShareLinkDialog() {
    setShareLinkOpen(true);
    setShareLinkError(null);
    setShareLinkCopied(false);
  }

  async function createShareLink() {
    if (!canShareList || shareLinkBusy) return;

    setShareLinkBusy(true);
    setShareLinkError(null);
    setShareLinkCopied(false);

    try {
      const res = await fetch(`/api/lists/${listId}/share-links`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: shareLinkRole }),
      });
      const body = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(
          typeof body === "string"
            ? body
            : body?.message || body?.error || "Δεν δημιουργήθηκε σύνδεσμος κοινής χρήσης.",
        );
      }

      const token = String(body?.token || "").trim();
      if (!token) {
        throw new Error("Δεν επιστράφηκε έγκυρος σύνδεσμος κοινής χρήσης.");
      }

      const url =
        typeof window !== "undefined"
          ? new URL(`/lists/share/${encodeURIComponent(token)}`, window.location.origin).toString()
          : `/lists/share/${encodeURIComponent(token)}`;
      setShareLinkUrl(url);
      setShareStatus("Ο σύνδεσμος κοινής χρήσης δημιουργήθηκε.");

      try {
        await navigator.clipboard?.writeText(url);
        setShareLinkCopied(true);
      } catch {
        // The link is still visible for manual copy if clipboard access is blocked.
      }
    } catch (err: any) {
      setShareLinkError(String(err?.message || err || "Δεν δημιουργήθηκε σύνδεσμος κοινής χρήσης."));
    } finally {
      setShareLinkBusy(false);
    }
  }

  async function copyShareLink() {
    if (!shareLinkUrl) return;

    try {
      await navigator.clipboard?.writeText(shareLinkUrl);
      setShareLinkCopied(true);
    } catch {
      setShareLinkError("Δεν ήταν δυνατή η αντιγραφή. Μπορείς να επιλέξεις τον σύνδεσμο χειροκίνητα.");
    }
  }

  async function leaveList() {
    if (!canLeaveList) return;
    const ok = window.confirm("Θέλεις να αποχωρήσεις από αυτή τη λίστα;");
    if (!ok) return;

    setShareStatus("Αποχώρηση από τη λίστα...");
    try {
      const res = await fetch(`/api/lists/${listId}/members/${viewerUserId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(
          typeof body === "string" ? body : body?.message || body?.error || "Δεν ήταν δυνατή η αποχώρηση.",
        );
      }
      router.push("/lists");
    } catch (err: any) {
      setShareStatus(String(err?.message || err || "Δεν ήταν δυνατή η αποχώρηση."));
    }
  }

  const listSongsHref = `/songs?skip=0&take=50&listIds=${encodeURIComponent(String(listId))}`;

  const headerTitleFontSize = 22;
  const metaFontSize = 14;
  const itemFontSize = 15;
  const itemLineHeight = "20px";

  return (
    <section className="list-detail-page">
      <ActionBar
        left={A.backLink({ href: "/lists", label: "Πίσω" })}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {A.link({
              href: listSongsHref,
              label: "Φίλτρα",
              action: "search",
              variant: "secondary",
            })}

            <Button
              type="button"
              variant="secondary"
              icon={Printer}
              onClick={handlePrintPreview}
              title="Προεπισκόπηση εκτύπωσης"
            >
              Εκτύπωση
            </Button>

            <Button
              type="button"
              variant="secondary"
              action="share"
              onClick={handleShareImage}
              title="Κοινοποίηση λίστας ως εικόνα"
            >
              Εικόνα
            </Button>

            {canShareList ? (
              <Button
                type="button"
                variant="secondary"
                icon={Link2}
                onClick={openShareLinkDialog}
                title="Κοινή χρήση λίστας με σύνδεσμο"
              >
                Κοινή χρήση
              </Button>
            ) : null}

            {canLeaveList ? (
              <Button
                type="button"
                variant="secondary"
                icon={LogOut}
                onClick={leaveList}
                title="Αποχώρηση από τη λίστα"
              >
                Αποχώρηση
              </Button>
            ) : null}

            {canEdit
              ? A.link({
                  href: `/lists/${listId}/edit`,
                  label: "Επεξεργασία",
                  action: "edit",
                  variant: "secondary",
                })
              : null}
          </div>
        }
      />

      <header style={{ margin: "0.85rem 0 1rem" }}>
        <h1
          style={{
            margin: 0,
            fontSize: headerTitleFontSize,
            fontWeight: 900,
            letterSpacing: 0.2,
            color: "rgba(255,255,255,0.98)",
            textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            lineHeight: "28px",
            wordBreak: "break-word",
          }}
        >
          {headerTitle}
        </h1>

        <div
          style={{
            fontSize: metaFontSize,
            color: "rgba(255,255,255,0.80)",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.85rem",
            marginTop: 10,
            alignItems: "center",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Ρόλος:
            <span style={roleBadgeStyle(role)} title={roleHint(role)}>
              <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95 }}>
                {roleIcon(role)}
              </span>
              {roleLabel(role)}
            </span>
          </span>

          {groupMetaLabel ? (
            <span>
              <strong style={{ color: "#fff", fontWeight: 800 }}>{groupMetaLabel}</strong>
            </span>
          ) : null}
        </div>
      </header>

      {shareStatus ? (
        <div
          role="status"
          style={{
            marginBottom: 12,
            color: "rgba(255,255,255,0.86)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {shareStatus}
        </div>
      ) : null}

      {toneStatus ? (
        <div
          role="status"
          style={{
            marginBottom: 12,
            color: toneStatus.startsWith("Σφάλμα") ? "#ffb4b4" : "rgba(255,255,255,0.86)",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {toneStatus}
        </div>
      ) : null}

      {allItemTags.length ? (
        <div className="list-item-tag-filters" aria-label="Φίλτρο tags τραγουδιών λίστας">
          <button
            type="button"
            className={!activeItemTag ? "is-active" : ""}
            onClick={() => setActiveItemTag(null)}
          >
            Όλα
          </button>
          {allItemTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={activeItemTag && tagKey(activeItemTag) === tagKey(tag) ? "is-active" : ""}
              onClick={() => setActiveItemTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      <div className="list-detail-content">
        <div className="list-detail-list-panel">
          {!items || items.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16 }}>
              Η λίστα δεν περιέχει τραγούδια.
            </p>
          ) : visibleItems.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16 }}>
              Δεν υπάρχουν τραγούδια με αυτό το tag.
            </p>
          ) : (
            <ul style={{ listStyleType: "none", padding: 0, margin: 0, display: "grid", gap: 8, maxWidth: "100%", minWidth: 0 }}>
          {visibleItems.map((item: any) => {
            const listItemId = Number(item.listItemId);
            const sortId = item.sortId ?? "";
            const titleText = item.title || `(αντικείμενο #${listItemId})`;

            const info = songIdByListItemId.get(listItemId);
            const linkedSongId = info?.songId ? Number(info.songId) : null;
            const songHref = info && linkedSongId ? buildSongHref(info) : null;
            const previewItem = songPreviewByListItemId.get(listItemId) ?? null;
            const isSelectedPreview = effectiveSelectedPreviewListItemId === listItemId;
            const lyricsPreview = lyricsPreviewText((item as any).lyrics);
            const itemTags = normalizeListItemTags((item as any).tags);
            const selectedTonicityLabel = info?.selectedTonicity
              ? `${info.selectedTonicity}${info.selectedTonicitySign ?? ""}`
              : null;
            const selectedSingerLabel = info?.selectedSingerTuneTitle || null;
            const selectionLabel = selectedSingerLabel
              ? `${selectedSingerLabel}${selectedTonicityLabel ? ` · ${selectedTonicityLabel}` : ""}`
              : selectedTonicityLabel;

            const rowStyle: React.CSSProperties = {
              border: isSelectedPreview ? "1px solid rgba(88,166,255,0.62)" : "1px solid rgba(255,255,255,0.22)",
              background: isSelectedPreview ? "rgba(13,110,253,0.18)" : "rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: "10px 12px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
              maxWidth: "100%",
              minWidth: 0,
              boxSizing: "border-box",
              overflow: "hidden",
              cursor: songHref ? "pointer" : undefined,
            };

            const contentStyle: React.CSSProperties = {
              color: "rgba(255,255,255,0.98)",
              fontSize: itemFontSize,
              lineHeight: itemLineHeight,
              fontWeight: 800,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              alignItems: "center",
              gap: "4px 10px",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              boxSizing: "border-box",
            };

            const numberStyle: React.CSSProperties = {
              flex: "0 0 auto",
              gridArea: "number",
              minWidth: 38,
              textAlign: "right",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 900,
              letterSpacing: 0.2,
            };

            const titleStyle: React.CSSProperties = {
              flex: "1 1 auto",
              gridArea: "title",
              display: "block",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              fontSize: 14,
              lineHeight: "18px",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            };

            const titleTextStyle: React.CSSProperties = {
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 14,
              lineHeight: "18px",
              fontWeight: 800,
            };

            const songLinkStyle: React.CSSProperties = {
              gridColumn: 1,
              gridRow: "1 / span 2",
              display: "grid",
              gridTemplateColumns: "38px minmax(0, 1fr)",
              gridTemplateAreas: `"number title" ". lyrics"`,
              alignItems: "center",
              gap: "2px 8px",
              flex: "1 1 auto",
              width: "auto",
              minWidth: 0,
              maxWidth: "100%",
              color: "inherit",
              textDecoration: "none",
            };

            const selectionStyle: React.CSSProperties = {
              gridColumn: 2,
              gridRow: "1 / span 2",
              justifySelf: "end",
              alignSelf: "center",
              flex: "0 0 auto",
              minWidth: 0,
              maxWidth: "min(130px, 34vw)",
              color: "rgba(255,255,255,0.68)",
              fontSize: 13,
              fontWeight: 400,
              lineHeight: "17px",
              textShadow: "none",
              display: "inline-flex",
              flexDirection: "column-reverse",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: "auto",
              gap: 4,
            };

            const singerSelectionStyle: React.CSSProperties = {
              flex: "1 1 auto",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "center",
            };

            const tonicitySelectionStyle: React.CSSProperties = {
              flex: "0 0 auto",
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              whiteSpace: "nowrap",
            };
            const toneControlVisible = Boolean(linkedSongId && (canEdit || selectedTonicityLabel || selectedSingerLabel));

            return (
              <li
                key={listItemId}
                id={`item_${listItemId}`}
                style={rowStyle}
                onClick={songHref ? (event) => handleSongRowOpen(event, songHref, previewItem) : undefined}
              >
                {songHref && linkedSongId ? (
                  <div className="list-song-row-content" style={contentStyle}>
                    <Link
                      className="list-song-link"
                      href={songHref}
                      prefetch={false}
                      onClick={(event) =>
                        previewItem
                          ? handleSongOpenInList(event, previewItem)
                          : navigateDocumentWhenOffline(event, songHref)
                      }
                      style={songLinkStyle}
                    >
                      <span className="list-song-number" style={numberStyle}>{sortId ? `${sortId}.` : "•"}</span>
                      <span
                        className="list-song-line"
                        style={titleStyle}
                      >
                        <span className="list-song-title-text" style={titleTextStyle}>{titleText}</span>
                      </span>
                      {lyricsPreview || itemTags.length ? (
                        <span className="list-song-subline">
                          {lyricsPreview ? (
                            <span className="list-song-lyrics-preview">{lyricsPreview}</span>
                          ) : null}
                          {itemTags.map((tag) => (
                            <span
                              key={tag}
                              className="list-song-item-tag"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setActiveItemTag(tag);
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </Link>
                    {toneControlVisible ? (
                      <span
                        className="list-song-selection"
                        style={selectionStyle}
                        title={selectionLabel ?? "Επιλογή τόνου και τραγουδιστή"}
                        data-no-row-open="true"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {selectedSingerLabel ? (
                          <span className="list-song-singer" style={singerSelectionStyle}>{selectedSingerLabel}</span>
                        ) : null}
                        <span className="list-song-tone" style={tonicitySelectionStyle}>
                          <ListItemTonePicker
                            songId={linkedSongId}
                            songOriginalKey={(item as any).songOriginalKey}
                            songOriginalKeySign={(item as any).songOriginalKeySign}
                            singerSuggestions={singerSuggestions}
                            value={toneValueFromItem(item)}
                            onChange={(nextTone) => updateItemTone(listItemId, nextTone)}
                            disabled={!canEdit || toneSavingListItemId !== null}
                            showSingerInButton={false}
                            compact
                          />
                        </span>
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="list-song-row-content" style={contentStyle}>
                    <span className="list-song-number" style={numberStyle}>{sortId ? `${sortId}.` : "•"}</span>
                    <span style={{ flex: "1 1 auto", wordBreak: "break-word" }}>{titleText}</span>
                  </div>
                )}
              </li>
            );
          })}
            </ul>
          )}
        </div>

        {songPreviewItems.length ? (
          <aside className="list-song-preview-pane" aria-label="Προβολή τραγουδιού λίστας">
            {selectedPreviewItem ? (
              <>
                <iframe
                  key={selectedPreviewItem.embedHref}
                  className="list-song-preview-frame"
                  src={selectedPreviewItem.embedHref}
                  title={`Τραγούδι: ${selectedPreviewItem.title}`}
                  loading="lazy"
                />
              </>
            ) : (
              <div className="list-song-preview-empty">Επίλεξε τραγούδι από τη λίστα.</div>
            )}
          </aside>
        ) : null}
      </div>

      {shareLinkOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Κοινή χρήση λίστας"
          className="list-share-link-modal"
        >
          <div className="list-share-link-modal__backdrop" onClick={() => setShareLinkOpen(false)} />
          <div className="list-share-link-modal__panel">
            <div className="list-share-link-modal__header">
              <div>
                <strong>Κοινή χρήση λίστας</strong>
                <p>Δημιούργησε σύνδεσμο που δίνει πρόσβαση στη λίστα μετά από σύνδεση.</p>
              </div>
              <button
                type="button"
                className="list-share-link-close"
                onClick={() => setShareLinkOpen(false)}
                aria-label="Κλείσιμο"
              >
                <X size={20} />
              </button>
            </div>

            <div className="list-share-link-role-group" role="radiogroup" aria-label="Δικαίωμα σύνδεσμου">
              <button
                type="button"
                role="radio"
                aria-checked={shareLinkRole === "VIEWER"}
                className={shareLinkRole === "VIEWER" ? "is-active" : ""}
                onClick={() => {
                  setShareLinkRole("VIEWER");
                  setShareLinkUrl(null);
                  setShareLinkCopied(false);
                }}
              >
                <span>Ανάγνωση</span>
                <small>Μπορεί να βλέπει τη λίστα.</small>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={shareLinkRole === "SONGS_EDITOR"}
                className={shareLinkRole === "SONGS_EDITOR" ? "is-active" : ""}
                onClick={() => {
                  setShareLinkRole("SONGS_EDITOR");
                  setShareLinkUrl(null);
                  setShareLinkCopied(false);
                }}
              >
                <span>Επεξεργασία</span>
                <small>Μπορεί να αλλάζει τα τραγούδια της λίστας.</small>
              </button>
            </div>

            <div className="list-share-link-actions">
              <Button
                type="button"
                variant="primary"
                icon={Link2}
                onClick={createShareLink}
                disabled={shareLinkBusy}
              >
                {shareLinkBusy ? "Δημιουργία..." : "Δημιουργία συνδέσμου"}
              </Button>
            </div>

            {shareLinkUrl ? (
              <div className="list-share-link-result">
                <label htmlFor="list-share-link-url">Σύνδεσμος</label>
                <div>
                  <input id="list-share-link-url" readOnly value={shareLinkUrl} onFocus={(event) => event.currentTarget.select()} />
                  <Button type="button" variant="secondary" icon={Copy} onClick={copyShareLink}>
                    {shareLinkCopied ? "Αντιγράφηκε" : "Αντιγραφή"}
                  </Button>
                </div>
                <p>
                  Όποιος ανοίξει τον σύνδεσμο θα συνδεθεί με Google, θα πάρει το δικαίωμα που επέλεξες και θα
                  μεταφερθεί στη λίστα.
                </p>
              </div>
            ) : null}

            {shareLinkError ? <div className="list-share-link-error">{shareLinkError}</div> : null}
          </div>
        </div>
      ) : null}

      {printPreviewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Προεπισκόπηση εκτύπωσης λίστας"
          className="list-print-modal"
        >
          <div className="list-print-modal__backdrop" onClick={() => setPrintPreviewOpen(false)} />
          <div className="list-print-modal__panel">
            <div className="list-print-modal__toolbar">
              <strong>Προεπισκόπηση εκτύπωσης</strong>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Printer}
                  className="list-print-tool"
                  onClick={handlePrint}
                  title="Εκτύπωση"
                >
                  Εκτύπωση
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  className="list-print-tool"
                  onClick={handleShareImage}
                  title="Αποθήκευση ως εικόνα"
                >
                  Εικόνα
                </Button>
                <button
                  type="button"
                  className="list-print-close"
                  onClick={() => setPrintPreviewOpen(false)}
                  aria-label="Κλείσιμο"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div id="list-print-preview" className="list-print-preview">
              <h1>{headerTitle}</h1>
              <div className="list-print-meta">
                <span>{printRows.length} τραγούδια</span>
                {groupMetaLabel ? <span>{groupMetaLabel}</span> : null}
              </div>

              <ol className="list-print-items">
                {printRows.map((row, index) => (
                  <li key={`${row.number}-${row.title}-${index}`}>
                    <div className="list-print-item-title">
                      <span className="list-print-item-number">{row.number}</span>
                      <span>{row.title}</span>
                    </div>
                    {row.selection ? <div className="list-print-item-selection">{row.selection}</div> : null}
                  </li>
                ))}
              </ol>

              <div className="list-print-footer">Repertorio.net</div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .list-print-modal {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .list-print-modal__backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.74);
        }

        .list-print-modal__panel {
          position: relative;
          width: min(920px, 100%);
          max-height: min(92vh, 980px);
          overflow: auto;
          border-radius: 14px;
          background: #f3f4f6;
          color: #111827;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }

        .list-print-modal__toolbar {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #111827;
          color: #fff;
        }

        .list-print-tool,
        .list-print-close {
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          border-radius: 9px;
          padding: 7px 9px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 800;
          cursor: pointer;
        }

        .list-print-close {
          padding: 7px;
        }

        .list-share-link-modal {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .list-share-link-modal__backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.72);
        }

        .list-share-link-modal__panel {
          position: relative;
          width: min(560px, 100%);
          max-height: min(92vh, 760px);
          overflow: auto;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 16px;
          background: #141414;
          color: #fff;
          padding: 18px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
        }

        .list-share-link-modal__header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .list-share-link-modal__header strong {
          display: block;
          font-size: 20px;
          line-height: 26px;
        }

        .list-share-link-modal__header p {
          margin: 6px 0 0;
          color: rgba(255, 255, 255, 0.72);
          font-size: 14px;
          line-height: 20px;
        }

        .list-share-link-close {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          cursor: pointer;
        }

        .list-share-link-role-group {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .list-share-link-role-group button {
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          padding: 12px;
          text-align: left;
          cursor: pointer;
        }

        .list-share-link-role-group button.is-active {
          border-color: rgba(255, 78, 89, 0.82);
          background: rgba(255, 78, 89, 0.22);
          box-shadow: inset 0 0 0 1px rgba(255, 78, 89, 0.25);
        }

        .list-share-link-role-group span {
          display: block;
          font-weight: 900;
          font-size: 15px;
          line-height: 20px;
        }

        .list-share-link-role-group small {
          display: block;
          margin-top: 4px;
          color: rgba(255, 255, 255, 0.66);
          font-weight: 700;
          line-height: 18px;
        }

        .list-share-link-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 16px;
        }

        .list-share-link-result {
          margin-top: 16px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 13px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
        }

        .list-share-link-result label {
          display: block;
          margin-bottom: 8px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.92);
        }

        .list-share-link-result > div {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .list-share-link-result input {
          min-width: 0;
          width: 100%;
          height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 10px;
          background: #fff;
          color: #111827;
          padding: 0 12px;
          font-weight: 700;
        }

        .list-share-link-result p {
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.64);
          font-size: 13px;
          line-height: 18px;
        }

        .list-share-link-error {
          margin-top: 12px;
          border: 1px solid rgba(255, 99, 99, 0.32);
          border-radius: 10px;
          background: rgba(255, 99, 99, 0.16);
          color: #ffd0d0;
          padding: 10px 12px;
          font-weight: 800;
        }

        .list-song-row-content {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          width: 100%;
          gap: 4px 10px;
        }

        .list-song-link {
          grid-column: 1;
          grid-row: 1 / span 2;
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr);
          grid-template-areas:
            "number title"
            ". lyrics";
          width: auto;
          min-width: 0;
          max-width: 100%;
          align-items: center;
          gap: 2px 8px;
        }

        .list-song-number {
          grid-area: number;
        }

        .list-song-line {
          grid-area: title;
          display: block;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 14px;
          line-height: 18px;
          white-space: nowrap;
        }

        .list-song-title-text {
          font-size: 14px;
          line-height: 18px;
        }

        .list-item-tag-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 12px;
          max-width: 100%;
        }

        .list-item-tag-filters button {
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.88);
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 900;
          line-height: 16px;
          cursor: pointer;
          max-width: 100%;
        }

        .list-item-tag-filters button.is-active {
          background: #ff4d55;
          border-color: rgba(255, 255, 255, 0.25);
          color: #fff;
        }

        .list-song-subline {
          grid-area: lyrics;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 5px;
          min-width: 0;
          margin-top: 1px;
          overflow: hidden;
        }

        .list-song-lyrics-preview {
          display: inline-block;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.48);
          font-size: 12.5px;
          line-height: 16px;
          font-weight: 600;
          text-shadow: none;
        }

        .list-song-item-tag {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.72);
          padding: 1px 6px;
          font-size: 11.5px;
          line-height: 15px;
          font-weight: 800;
          text-shadow: none;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .list-song-selection {
          grid-column: 2;
          grid-row: 1 / span 2;
          justify-self: end;
          align-self: center;
          display: inline-flex;
          flex-direction: column-reverse;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: auto;
          max-width: min(130px, 34vw);
          min-width: 0;
          margin-left: auto;
          gap: 4px;
        }

        .list-song-tone {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
        }

        .list-song-singer {
          max-width: 100%;
          text-align: center;
        }

        .list-detail-page {
          width: min(1180px, calc(100% - 20px));
          box-sizing: border-box;
          margin: 0 auto;
          padding: clamp(12px, 1.8vw, 24px) 0 34px;
          overflow-x: hidden;
        }

        .list-detail-content {
          display: block;
          max-width: 100%;
          min-width: 0;
        }

        .list-detail-list-panel {
          min-width: 0;
          max-width: 100%;
        }

        .list-song-preview-pane {
          display: none;
        }

        .list-song-preview-frame {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: #000;
        }

        .list-song-preview-empty {
          min-height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          color: rgba(255, 255, 255, 0.72);
          font-weight: 800;
          text-align: center;
        }

        @media (min-width: 769px) {
          .list-detail-content {
            display: grid;
            grid-template-columns: minmax(280px, 36vw) minmax(0, 1fr);
            gap: 12px;
            align-items: start;
          }

          .list-detail-list-panel {
            position: sticky;
            top: 12px;
            height: calc(100vh - 24px);
            min-height: min(620px, calc(100vh - 24px));
            overflow-x: hidden;
            overflow-y: auto;
            padding-right: 4px;
            overscroll-behavior: contain;
            scrollbar-gutter: stable;
          }

          .list-song-preview-pane {
            display: block;
            position: sticky;
            top: 12px;
            height: calc(100vh - 24px);
            min-height: min(620px, calc(100vh - 24px));
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 18px;
            background: #000;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.28);
          }
        }

        @media (min-width: 1100px) {
          .list-detail-content {
            grid-template-columns: minmax(340px, 430px) minmax(0, 1fr);
            gap: 16px;
          }
        }

        @media (max-width: 768px) {
          .list-detail-page {
            width: min(100% - 16px, 1180px);
            padding-top: 12px;
          }
        }

        .list-print-preview {
          margin: 18px auto;
          width: min(760px, calc(100% - 24px));
          min-height: 70vh;
          background: #fff !important;
          color: #111827 !important;
          -webkit-text-fill-color: #111827 !important;
          padding: 42px 48px;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
        }

        .list-print-preview *,
        .list-print-preview h1,
        .list-print-preview span,
        .list-print-preview div,
        .list-print-preview li {
          color: #111827 !important;
          -webkit-text-fill-color: #111827 !important;
          text-shadow: none !important;
        }

        .list-print-preview h1 {
          margin: 0;
          font-size: 30px;
          line-height: 36px;
          color: #111827 !important;
          -webkit-text-fill-color: #111827 !important;
        }

        .list-print-meta {
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px 18px;
          color: #4b5563 !important;
          -webkit-text-fill-color: #4b5563 !important;
          font-weight: 700;
        }

        .list-print-items {
          margin: 30px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 13px;
        }

        .list-print-items li {
          break-inside: avoid;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 11px;
        }

        .list-print-item-title {
          display: grid;
          grid-template-columns: 54px minmax(0, 1fr);
          gap: 12px;
          font-size: 20px;
          line-height: 27px;
          font-weight: 850;
        }

        .list-print-item-number {
          color: #6b7280 !important;
          -webkit-text-fill-color: #6b7280 !important;
          text-align: right;
        }

        .list-print-item-selection {
          margin: 4px 0 0 66px;
          color: #4b5563 !important;
          -webkit-text-fill-color: #4b5563 !important;
          font-size: 14px;
          line-height: 19px;
          font-weight: 700;
        }

        .list-print-footer {
          margin-top: 32px;
          color: #6b7280 !important;
          -webkit-text-fill-color: #6b7280 !important;
          font-size: 13px;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .list-song-singer {
            max-width: min(120px, 34vw);
            font-size: 12px;
            line-height: 15px;
            color: rgba(255, 255, 255, 0.62);
            white-space: nowrap;
          }

          .list-share-link-modal {
            padding: 10px;
            align-items: center;
          }

          .list-share-link-modal__panel {
            padding: 14px;
            border-radius: 14px;
          }

          .list-share-link-role-group {
            grid-template-columns: 1fr;
          }

          .list-share-link-actions {
            justify-content: stretch;
          }

          .list-share-link-actions > button {
            width: 100%;
            justify-content: center;
          }

          .list-share-link-result > div {
            grid-template-columns: 1fr;
          }

          .list-print-modal {
            padding: 0;
            align-items: stretch;
          }

          .list-print-modal__panel {
            width: 100%;
            max-height: 100vh;
            border-radius: 0;
          }

          .list-print-modal__toolbar {
            align-items: flex-start;
          }

          .list-print-preview {
            width: calc(100% - 16px);
            padding: 28px 22px;
          }

          .list-print-item-title {
            grid-template-columns: 42px minmax(0, 1fr);
            font-size: 18px;
          }

          .list-print-item-selection {
            margin-left: 54px;
          }
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          #list-print-preview,
          #list-print-preview * {
            visibility: visible !important;
          }

          #list-print-preview {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 18mm 16mm !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #111827 !important;
            -webkit-text-fill-color: #111827 !important;
          }

          #list-print-preview *,
          #list-print-preview h1,
          #list-print-preview span,
          #list-print-preview div,
          #list-print-preview li {
            color: #111827 !important;
            -webkit-text-fill-color: #111827 !important;
            text-shadow: none !important;
          }

          .list-print-modal,
          .list-print-modal__panel {
            position: static !important;
            inset: auto !important;
            display: block !important;
            padding: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            background: #fff !important;
            box-shadow: none !important;
          }

          .list-print-modal__backdrop,
          .list-print-modal__toolbar {
            display: none !important;
          }
        }
      `}</style>
    </section>
  );
}
