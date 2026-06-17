"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Mic2 } from "lucide-react";

import { parseTonicity } from "@/app/components/tonicity";
import {
  readOfflineSingerTunes,
  writeOfflineSingerTunes,
} from "@/lib/offlineStore";

type SingerTuneRow = {
  id: number;
  songId: number;
  title: string;
  tune: string;
  createdByUserId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type Props = {
  songId: number;
  songHref: string;
};

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function browserOnline() {
  return typeof navigator === "undefined" || typeof navigator.onLine === "undefined"
    ? true
    : navigator.onLine;
}

function normalizeRows(rows: unknown): SingerTuneRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row: any) => ({
      id: Number(row?.id),
      songId: Number(row?.songId),
      title: String(row?.title || "").trim(),
      tune: String(row?.tune || "").trim(),
      createdByUserId:
        row?.createdByUserId == null ? null : Number(row.createdByUserId),
      createdAt: row?.createdAt ? String(row.createdAt) : undefined,
      updatedAt: row?.updatedAt ? String(row.updatedAt) : undefined,
    }))
    .filter((row) => Number.isFinite(row.id) && row.id > 0 && row.title && row.tune);
}

function appendTuneParams(songHref: string, row: SingerTuneRow) {
  const parsedTune = parseTonicity(row.tune);
  const url = new URL(songHref, "https://repertorio.local");

  if (parsedTune) url.searchParams.set("tonicity", parsedTune);
  url.searchParams.set("singerTuneId", String(row.id));
  url.searchParams.set("singer", row.title);

  return `${url.pathname}${url.search}${url.hash}`;
}

function navigateDocumentWhenOffline(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    navigator.onLine !== false
  ) {
    return;
  }

  event.preventDefault();
  window.location.href = href;
}

export default function ListItemSingerTunePicker({ songId, songHref }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SingerTuneRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || rows !== null || loading) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      const cachedRows = await readOfflineSingerTunes(songId).catch(() => null);
      if (!cancelled && Array.isArray(cachedRows)) {
        setRows(normalizeRows(cachedRows));
      }

      if (!browserOnline()) {
        if (!cancelled) {
          setRows(normalizeRows(cachedRows));
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(`/api/songs/${songId}/singer-tunes`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data = await readJson(res);

        if (!res.ok) {
          const msg =
            data && typeof data === "object" && ("error" in data || "message" in data)
              ? String((data as any).error || (data as any).message)
              : `HTTP ${res.status}`;
          throw new Error(msg);
        }

        const nextRows = normalizeRows(data);
        if (!cancelled) {
          setRows(nextRows);
          void writeOfflineSingerTunes(songId, nextRows).catch(() => null);
        }
      } catch (e: any) {
        if (!cancelled) {
          if (Array.isArray(cachedRows)) setRows(normalizeRows(cachedRows));
          else {
            setRows([]);
            setErr(e?.message || "Αποτυχία φόρτωσης τονικοτήτων");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [loading, open, rows, songId]);

  const sortedRows = useMemo(() => {
    return [...(rows || [])].sort((a, b) => {
      const at = a.title.localeCompare(b.title, "el", { sensitivity: "base" });
      if (at !== 0) return at;
      return a.tune.localeCompare(b.tune, "el", { sensitivity: "base" });
    });
  }, [rows]);

  return (
    <div className="list-tune-picker" data-no-swipe="true">
      <button
        type="button"
        className="list-tune-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Επιλογή τόνου και τραγουδιστή"
      >
        <Mic2 size={15} aria-hidden="true" />
        <span>Τόνος / τραγουδιστής</span>
        {loading ? (
          <Loader2 size={14} className="spin" aria-hidden="true" />
        ) : (
          <ChevronDown size={14} aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div className="list-tune-panel">
          {loading && rows === null ? (
            <div className="list-tune-status">Φόρτωση…</div>
          ) : err ? (
            <div className="list-tune-status error">Σφάλμα: {err}</div>
          ) : sortedRows.length === 0 ? (
            <div className="list-tune-status">Δεν υπάρχουν τονικότητες για αυτό το τραγούδι.</div>
          ) : (
            <div className="list-tune-options">
              {sortedRows.map((row) => {
                const href = appendTuneParams(songHref, row);
                const parsedTune = parseTonicity(row.tune) || row.tune;

                return (
                  <a
                    key={row.id}
                    href={href}
                    className="list-tune-option"
                    onClick={(event) => navigateDocumentWhenOffline(event, href)}
                    title={`Άνοιγμα με ${row.title} - ${parsedTune}`}
                  >
                    <span className="list-tune-name">{row.title}</span>
                    <strong className="list-tune-value">{parsedTune}</strong>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <style jsx>{`
        .list-tune-picker {
          margin-top: 8px;
          padding-left: 48px;
        }

        .list-tune-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          min-height: 34px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.94);
          padding: 6px 9px;
          font-size: 13px;
          font-weight: 800;
          line-height: 16px;
          cursor: pointer;
        }

        .list-tune-toggle:hover {
          background: rgba(255, 255, 255, 0.12);
        }

        .list-tune-panel {
          margin-top: 7px;
          max-width: 680px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(0, 0, 0, 0.28);
          padding: 8px;
        }

        .list-tune-status {
          color: rgba(255, 255, 255, 0.82);
          font-size: 13px;
          line-height: 18px;
        }

        .list-tune-status.error {
          color: #ffb4b4;
        }

        .list-tune-options {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .list-tune-option {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          max-width: 100%;
          border-radius: 8px;
          border: 1px solid #444;
          background: #222;
          color: #fff;
          padding: 6px 9px;
          text-decoration: none;
          font-size: 13px;
          line-height: 16px;
        }

        .list-tune-option:hover {
          background: #3a3a3a;
        }

        .list-tune-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 220px;
          font-weight: 700;
        }

        .list-tune-value {
          flex: 0 0 auto;
          color: #fff;
          font-weight: 900;
        }

        .spin {
          animation: spin 800ms linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 520px) {
          .list-tune-picker {
            padding-left: 0;
          }

          .list-tune-name {
            max-width: 170px;
          }
        }
      `}</style>
    </div>
  );
}
