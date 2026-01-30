"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ReindexStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;

  total: number;
  processed: number;
  indexed: number;
  errors: number;

  lastId: number | null;
  message: string | null;
};

type PreviewItem = {
  id?: number | null;
  legacySongId?: number | null;

  title?: string | null;
  firstLyrics?: string | null;
  lyrics?: string | null;

  // legacy
  characteristics?: string | null;

  // tags από ES
  tagIds?: number[] | null;
  tagTitles?: string[] | null;
  tagSlugs?: string[] | null;

  originalKey?: string | null;

  categoryId?: number | null;
  rythmId?: number | null;

  categoryTitle?: string | null;
  rythmTitle?: string | null;

  composerId?: number | null;
  composerName?: string | null;
  lyricistId?: number | null;
  lyricistName?: string | null;

  // ✅ NEW: createdBy
  createdById?: number | null;
  createdByName?: string | null;

  singerFrontNames?: string[] | null;
  singerBackNames?: string[] | null;

  discographies?: Array<{
    versionId: number | null;
    year: number | null;
    singerFrontNames: string[];
    singerBackNames: string[];
  }> | null;

  years?: number[] | null;
  minYear?: number | null;
  maxYear?: number | null;
  yearText?: string | null;

  hasChords?: boolean | null;
  hasLyrics?: boolean | null;
  hasScore?: boolean | null;

  views?: number | null;
  status?: string | null;
  scoreFile?: string | null;
};

type PreviewResponse = {
  total: number;
  items: PreviewItem[];
};

const TABLE_HEADERS = [
  "id",
  "legacySongId",
  "title",
  "firstLyrics",
  "tagTitles",
  "originalKey",
  "categoryId",
  "categoryTitle",
  "rythmId",
  "rythmTitle",

  "composerId",
  "composerName",
  "lyricistId",
  "lyricistName",

  // ✅ NEW
  "createdById",
  "createdByName",

  "singerFrontNames",
  "singerBackNames",

  "discographies",

  "minYear",
  "maxYear",
  "yearText",
  "views",
  "status",
  "scoreFile",
  "hasChords",
  "hasScore",
  "hasLyrics",
] as const;

type TableHeader = (typeof TABLE_HEADERS)[number];

function pct(done: number, total: number) {
  if (!total || total <= 0) return 0;
  const v = Math.floor((done / total) * 100);
  return Math.max(0, Math.min(100, v));
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function formatDiscographies(d?: PreviewItem["discographies"]) {
  if (!d?.length) return "–";
  return d
    .map((x) => {
      const v = x.versionId ?? "–";
      const f = x.singerFrontNames?.length ? x.singerFrontNames.join(",") : "–";
      const b = x.singerBackNames?.length ? x.singerBackNames.join(",") : "–";
      return `v${v}: ${f} / ${b}`;
    })
    .join(" | ");
}

export default function ElasticsearchTab() {
  /**
   * Client-side calls same-origin: Nginx proxies /api/v1 -> API
   */
  const apiBase = "/api/v1";

  // ✅ Prevent hydration mismatch by rendering only after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [status, setStatus] = useState<ReindexStatus | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [starting, setStarting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [recreate, setRecreate] = useState<boolean>(true);

  const pollRef = useRef<number | null>(null);
  const pollingBusyRef = useRef(false);

  const progress = useMemo(() => {
    if (!status) return 0;
    return pct(status.processed ?? 0, status.total ?? 0);
  }, [status]);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/admin/es/status`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`status HTTP ${res.status}: ${t}`);
      }

      const text = await res.text();
      const json = safeJsonParse<ReindexStatus>(text);
      if (!json) throw new Error(`status: invalid JSON response: ${text.slice(0, 200)}`);

      setStatus(json);
      return json;
    } catch (e: any) {
      setError(e?.message ?? "Αποτυχία φόρτωσης status");
      return null;
    } finally {
      setLoadingStatus(false);
    }
  }, [apiBase]);

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/admin/es/preview?take=25`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`preview HTTP ${res.status}: ${t}`);
      }

      const text = await res.text();
      const json = safeJsonParse<PreviewResponse>(text);
      if (!json) throw new Error(`preview: invalid JSON response: ${text.slice(0, 200)}`);

      const items = Array.isArray(json.items) ? json.items : [];
      const total = typeof json.total === "number" ? json.total : items.length;

      const normalized: PreviewResponse = { total, items };
      setPreview(normalized);
      return normalized;
    } catch (e: any) {
      setError(e?.message ?? "Αποτυχία φόρτωσης preview");
      return null;
    } finally {
      setLoadingPreview(false);
    }
  }, [apiBase]);

  const startReindex = useCallback(async () => {
    setStarting(true);
    setError(null);

    try {
      const url = `${apiBase}/admin/es/reindex${recreate ? "?recreate=1" : ""}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`reindex HTTP ${res.status}: ${t}`);
      }

      await fetchStatus();
    } catch (e: any) {
      setError(e?.message ?? "Αποτυχία εκκίνησης reindex");
    } finally {
      setStarting(false);
    }
  }, [apiBase, fetchStatus, recreate]);

  useEffect(() => {
    if (!mounted) return;
    void fetchStatus();
    void fetchPreview();
  }, [mounted, fetchStatus, fetchPreview]);

  useEffect(() => {
    if (!mounted) return;

    const running = !!status?.running;

    if (!running) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      pollingBusyRef.current = false;
      return;
    }

    if (pollRef.current) return;

    pollRef.current = window.setInterval(() => {
      if (pollingBusyRef.current) return;
      pollingBusyRef.current = true;

      void (async () => {
        const s = await fetchStatus();
        if (s && !s.running) {
          await fetchPreview();
        }
      })().finally(() => {
        pollingBusyRef.current = false;
      });
    }, 1200);

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      pollingBusyRef.current = false;
    };
  }, [mounted, status?.running, fetchStatus, fetchPreview]);

  if (!mounted) {
    // Δεν κάνουμε SSR markup για να αποφύγουμε hydration mismatch σε dev/HMR.
    return (
      <div
        style={{
          border: "1px solid #333",
          borderRadius: 12,
          padding: 14,
          background: "#0b0b0b",
          color: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Elasticsearch</h2>
        <div style={{ color: "#aaa", fontSize: 13 }}>Φόρτωση…</div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 12,
        padding: 14,
        background: "#0b0b0b",
        color: "#fff",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Elasticsearch</h2>

      <div style={{ marginBottom: 10, color: "#aaa", fontSize: 12 }}>
        API: <b style={{ color: "#fff" }}>{apiBase}</b>
      </div>

      {error && (
        <div
          style={{
            background: "#2b0b0b",
            border: "1px solid #7a1b1b",
            color: "#ffb3b3",
            padding: 10,
            borderRadius: 10,
            marginBottom: 10,
            whiteSpace: "pre-wrap",
          }}
        >
          Σφάλμα: {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => void fetchStatus()}
          disabled={loadingStatus}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loadingStatus ? "Φόρτωση..." : "Ανανέωση Status"}
        </button>

        <button
          type="button"
          onClick={() => void fetchPreview()}
          disabled={loadingPreview}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loadingPreview ? "Φόρτωση..." : "Ανανέωση Πίνακα"}
        </button>

        <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#ddd", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={recreate}
            onChange={(e) => setRecreate(e.target.checked)}
            disabled={starting || !!status?.running}
          />
          Recreate index
        </label>

        <button
          type="button"
          onClick={() => void startReindex()}
          disabled={starting || !!status?.running}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #666",
            background: status?.running ? "#555" : "#1a1a1a",
            color: "#fff",
            cursor: status?.running ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
          title={status?.running ? "Τρέχει ήδη reindex" : "Reindex από Postgres → ES"}
        >
          {starting ? "Εκκίνηση..." : status?.running ? "Reindex σε εξέλιξη..." : "Reindex τώρα"}
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>
            Progress: {progress}% {status?.running ? "(τρέχει)" : status ? "(έτοιμο)" : ""}
          </div>
          <div style={{ color: "#aaa" }}>
            {status?.processed ?? 0}/{status?.total ?? 0} processed • indexed {status?.indexed ?? 0} • errors{" "}
            {status?.errors ?? 0}
          </div>
        </div>

        <div
          style={{
            width: "100%",
            height: 10,
            borderRadius: 999,
            background: "#222",
            overflow: "hidden",
            border: "1px solid #333",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: status?.errors ? "#d33" : "#ddd",
              transition: "width 200ms linear",
            }}
          />
        </div>

        <div style={{ marginTop: 8, color: "#ccc", whiteSpace: "pre-wrap" }}>
          <b>Μήνυμα:</b> {status?.message ?? "–"}
          <br />
          <b>lastId:</b> {status?.lastId ?? "–"} • <b>startedAt:</b> {status?.startedAt ?? "–"} •{" "}
          <b>finishedAt:</b> {status?.finishedAt ?? "–"}
        </div>
      </div>

      <h3 style={{ marginTop: 0 }}>Δείγμα εγγραφών (index: app_songs)</h3>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 2250,
            fontSize: 13,
            background: "#0f0f0f",
          }}
        >
          <thead>
            <tr>
              {TABLE_HEADERS.map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 8px",
                    borderBottom: "1px solid #333",
                    background: "#111",
                    color: "#fff",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {(preview?.items ?? []).map((row, idx) => {
              const cells: Array<string | number> = [
                row.id ?? "–",
                row.legacySongId ?? "–",
                row.title ?? "–",
                row.firstLyrics ?? "–",
                row.tagTitles?.length ? row.tagTitles.join(", ") : "–",
                row.originalKey ?? "–",
                row.categoryId ?? "–",
                row.categoryTitle ?? "–",
                row.rythmId ?? "–",
                row.rythmTitle ?? "–",

                row.composerId ?? "–",
                row.composerName ?? "–",
                row.lyricistId ?? "–",
                row.lyricistName ?? "–",

                row.createdById ?? "–",
                row.createdByName ?? "–",

                row.singerFrontNames?.length ? row.singerFrontNames.join(", ") : "–",
                row.singerBackNames?.length ? row.singerBackNames.join(", ") : "–",

                formatDiscographies(row.discographies),

                typeof row.minYear === "number" ? row.minYear : row.minYear ?? "–",
                typeof row.maxYear === "number" ? row.maxYear : row.maxYear ?? "–",
                row.yearText ?? "–",
                typeof row.views === "number" ? row.views : row.views ?? "–",
                row.status ?? "–",
                row.scoreFile ?? "–",
                typeof row.hasChords === "boolean" ? String(row.hasChords) : "–",
                typeof row.hasScore === "boolean" ? String(row.hasScore) : "–",
                typeof row.hasLyrics === "boolean" ? String(row.hasLyrics) : "–",
              ];

              return (
                <tr key={idx}>
                  {cells.map((cell, i) => {
                    const col = TABLE_HEADERS[i] as TableHeader;
                    const ellipsisCols = new Set<TableHeader>(["firstLyrics", "tagTitles", "discographies"]);
                    const isEllipsis = ellipsisCols.has(col);

                    return (
                      <td
                        key={i}
                        style={{
                          padding: 8,
                          borderBottom: "1px solid #222",
                          color: "#ddd",
                          maxWidth: isEllipsis ? 520 : undefined,
                          overflow: isEllipsis ? "hidden" : undefined,
                          textOverflow: isEllipsis ? "ellipsis" : undefined,
                          whiteSpace: isEllipsis ? "nowrap" : undefined,
                        }}
                        title={isEllipsis ? String(cell ?? "") : undefined}
                      >
                        {cell as any}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {!preview?.items?.length && (
              <tr>
                <td colSpan={TABLE_HEADERS.length} style={{ padding: 10, color: "#aaa" }}>
                  Δεν υπάρχουν εγγραφές (ή απέτυχε το preview).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, color: "#aaa" }}>Σύνολο (ES): {preview?.total ?? "–"}</div>
    </div>
  );
}
