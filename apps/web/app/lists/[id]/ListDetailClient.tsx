// apps/web/app/lists/[id]/ListDetailClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import type { ListDetailDto } from "./page";

import { Crown, Download, Eye, Music2, Printer, Share2, Shield, X } from "lucide-react";

type Role = ListDetailDto["role"];

const LAST_VIEWED_LIST_KEY = "repertorio:lastViewedListId";
const RECENT_LISTS_KEY = "repertorio:recentListIds";
const RECENT_GROUPS_KEY = "repertorio:recentGroupIds";

type Props = {
  listId: number;
  viewerUserId: number;
  data: ListDetailDto;
};

function navigateDocumentWhenOffline(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (typeof window === "undefined" || typeof navigator === "undefined" || navigator.onLine !== false) return;
  event.preventDefault();
  window.location.href = href;
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
  if (role === "OWNER") return "Δημιουργός";
  if (role === "LIST_EDITOR") return "Διαχειριστής";
  if (role === "SONGS_EDITOR") return "Συντάκτης";
  return "Χρήστης";
}

function roleHint(role: Role) {
  if (role === "OWNER") return "Ορίζει δικαιώματα και διαχειρίζεται τη λίστα.";
  if (role === "LIST_EDITOR") return "Μπορεί να αλλάζει ρυθμίσεις/τίτλο και να διαχειρίζεται μέλη.";
  if (role === "SONGS_EDITOR") return "Μπορεί να επεξεργάζεται μόνο τα τραγούδια της λίστας.";
  return "Μπορεί να βλέπει τη λίστα.";
}

function roleIcon(role: Role): React.ReactNode {
  if (role === "OWNER") return <Crown size={14} />;
  if (role === "LIST_EDITOR") return <Shield size={14} />;
  if (role === "SONGS_EDITOR") return <Music2 size={14} />;
  return <Eye size={14} />;
}

type RoleTone = "gold" | "blue" | "violet" | "gray";

function roleTone(role: Role): RoleTone {
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
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    rememberRecentList(listId);
    rememberRecentGroup(data?.groupId);
  }, [listId, data?.groupId]);

  const { title, groupTitle, marked, role, items } = data;

  const canEdit = role === "OWNER" || role === "LIST_EDITOR" || role === "SONGS_EDITOR";
  const headerTitle = title || `Λίστα #${listId}`;

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
          ? `Φωνή: ${selectedSingerTuneTitle}${tonicityLabel ? ` · ${tonicityLabel}` : ""}`
          : tonicityLabel
            ? `Τόνος: ${tonicityLabel}`
            : null;

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

  function buildSongHref(info: {
    songId: number;
    pos: number;
    selectedTonicity: string | null;
    selectedTonicitySign: "+" | "-" | null;
    selectedSingerTuneId: number | null;
  }) {
    const params = new URLSearchParams({
      listId: String(listId),
      listPos: String(info.pos),
    });

    if (info.selectedTonicity) params.set("tonicity", info.selectedTonicity);
    if (info.selectedTonicitySign) params.set("tonicitySign", info.selectedTonicitySign);
    if (info.selectedSingerTuneId) params.set("singerTuneId", String(info.selectedSingerTuneId));

    return `/songs/${info.songId}?${params.toString()}`;
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
        groupTitle ? `Ομάδα: ${groupTitle}` : "Χωρίς ομάδα",
      ];
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

  const listSongsHref = `/songs?skip=0&take=50&listIds=${encodeURIComponent(String(listId))}`;

  const headerTitleFontSize = 22;
  const metaFontSize = 14;
  const itemFontSize = 18;
  const itemLineHeight = "24px";

  return (
    <section style={{ padding: "1rem" }}>
      <ActionBar
        left={A.backLink({ href: "/lists", label: "Πίσω" })}
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            {marked ? (
              <span
                aria-label="Αγαπημένη λίστα"
                title="Αγαπημένη λίστα"
                style={{
                  color: "#f5a623",
                  fontSize: 18,
                  lineHeight: 1,
                  textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                  flex: "0 0 auto",
                }}
              >
                ★
              </span>
            ) : null}

            <span
              style={{
                minWidth: 0,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={headerTitle}
            >
              {headerTitle}
            </span>
          </div>
        }
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {A.link({
              href: listSongsHref,
              label: "Φίλτρα",
              action: "search",
              variant: "secondary",
            })}

            <button
              type="button"
              onClick={handlePrintPreview}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.28)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontWeight: 850,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="Προεπισκόπηση εκτύπωσης"
            >
              <Printer size={17} />
              Εκτύπωση
            </button>

            <button
              type="button"
              onClick={handleShareImage}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.28)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontWeight: 850,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="Κοινοποίηση λίστας ως εικόνα"
            >
              <Share2 size={17} />
              Κοινοποίηση
            </button>

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

          <span>
            Ομάδα:{" "}
            <strong style={{ color: "#fff", fontWeight: 800 }}>
              {groupTitle ? groupTitle : "Χωρίς ομάδα"}
            </strong>
          </span>
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

      {!items || items.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16 }}>
          Η λίστα δεν περιέχει τραγούδια.
        </p>
      ) : (
        <ul style={{ listStyleType: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {items.map((item: any) => {
            const listItemId = Number(item.listItemId);
            const sortId = item.sortId ?? "";
            const titleText = item.title || `(αντικείμενο #${listItemId})`;

            const info = songIdByListItemId.get(listItemId);
            const linkedSongId = info?.songId ? Number(info.songId) : null;
            const songHref = info && linkedSongId ? buildSongHref(info) : null;
            const selectedTonicityLabel = info?.selectedTonicity
              ? `${info.selectedTonicity}${info.selectedTonicitySign ?? ""}`
              : null;
            const selectionLabel = info?.selectedSingerTuneTitle
              ? `Φωνή: ${info.selectedSingerTuneTitle}${
                  selectedTonicityLabel ? ` · ${selectedTonicityLabel}` : ""
                }`
              : selectedTonicityLabel
                ? `Τόνος: ${selectedTonicityLabel}`
                : null;

            const rowStyle: React.CSSProperties = {
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: "10px 12px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
            };

            const contentStyle: React.CSSProperties = {
              color: "rgba(255,255,255,0.98)",
              fontSize: itemFontSize,
              lineHeight: itemLineHeight,
              fontWeight: 800,
              display: "flex",
              gap: 10,
              alignItems: "baseline",
            };

            const numberStyle: React.CSSProperties = {
              flex: "0 0 auto",
              minWidth: 38,
              textAlign: "right",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 900,
              letterSpacing: 0.2,
            };

            const titleStyle: React.CSSProperties = {
              flex: "1 1 auto",
              wordBreak: "break-word",
              textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            };

            return (
              <li key={listItemId} id={`item_${listItemId}`} style={rowStyle}>
                {songHref && linkedSongId ? (
                  <>
                    <Link
                      href={songHref}
                      prefetch={false}
                      onClick={(event) => navigateDocumentWhenOffline(event, songHref)}
                      style={{ ...contentStyle, textDecoration: "none" }}
                    >
                      <span style={numberStyle}>{sortId ? `${sortId}.` : "•"}</span>
                      <span style={titleStyle}>
                        <span>{titleText}</span>
                        {selectionLabel ? (
                          <span
                            style={{
                              display: "block",
                              marginTop: 3,
                              color: "rgba(255,255,255,0.66)",
                              fontSize: 13,
                              fontWeight: 700,
                              lineHeight: "17px",
                              textShadow: "none",
                            }}
                          >
                            {selectionLabel}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </>
                ) : (
                  <div style={contentStyle}>
                    <span style={numberStyle}>{sortId ? `${sortId}.` : "•"}</span>
                    <span style={{ flex: "1 1 auto", wordBreak: "break-word" }}>{titleText}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

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
                <button type="button" className="list-print-tool" onClick={handlePrint}>
                  <Printer size={16} />
                  Εκτύπωση
                </button>
                <button type="button" className="list-print-tool" onClick={handleShareImage}>
                  <Download size={16} />
                  Εικόνα
                </button>
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
                <span>{groupTitle ? `Ομάδα: ${groupTitle}` : "Χωρίς ομάδα"}</span>
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
