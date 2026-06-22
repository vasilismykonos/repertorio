"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TrafficStats = {
  ok: true;
  cached?: boolean;
  generatedAt: string;
  cachedUntil: string;
  source: {
    files: string[];
    lineLimit: number;
    parsedLines: number;
    windowStart: string | null;
    windowEnd: string | null;
  };
  totals: {
    requests: number;
    pageViews: number;
    uniqueVisitors: number;
    botRequests: number;
    errorRequests: number;
    errorRate: number;
  };
  topPages: Array<{ path: string; views: number }>;
  statusCodes: Array<{ status: string; count: number }>;
  devices: Array<{ type: string; count: number }>;
  browsers: Array<{ name: string; count: number }>;
  referrers: Array<{ host: string; count: number }>;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("el-GR").format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        background: "#fff",
        padding: 14,
        minWidth: 0,
      }}
    >
      <div style={{ color: "#555", fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ color: "#111", fontSize: 28, fontWeight: 900, marginTop: 6 }}>{value}</div>
      {note ? <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>{note}</div> : null}
    </div>
  );
}

function MiniTable({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: any[];
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  empty?: string;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee", fontWeight: 900, color: "#111" }}>
        {title}
      </div>
      {rows.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse", color: "#111", fontSize: 13 }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: col.align || "left",
                    padding: "9px 12px",
                    borderBottom: "1px solid #eee",
                    color: "#555",
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      textAlign: col.align || "left",
                      padding: "9px 12px",
                      borderBottom: index === rows.length - 1 ? "none" : "1px solid #f1f1f1",
                      wordBreak: col.key === "path" ? "break-word" : "normal",
                    }}
                  >
                    {typeof row[col.key] === "number" ? formatNumber(row[col.key]) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: 14, color: "#666" }}>{empty || "Δεν υπάρχουν δεδομένα."}</div>
      )}
    </div>
  );
}

export default function TrafficTab() {
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/traffic${refresh ? "?refresh=1" : ""}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(json?.message || text || `HTTP ${res.status}`);
      setStats(json as TrafficStats);
    } catch (err: any) {
      setError(err?.message || "Αποτυχία φόρτωσης στατιστικών");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const sourceWindow = useMemo(() => {
    if (!stats) return "-";
    return `${formatDate(stats.source.windowStart)} - ${formatDate(stats.source.windowEnd)}`;
  }, [stats]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fff",
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: "#111" }}>Επισκεψιμότητα</h2>
          <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
            Ελαφριά σύνοψη από nginx access logs με cache 5 λεπτών.
          </div>
          {stats ? (
            <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
              Περίοδος δείγματος: {sourceWindow} · Γραμμές: {formatNumber(stats.source.parsedLines)} ·{" "}
              {stats.cached ? "από cache" : "νέα ανάγνωση"}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: loading ? "#eee" : "#111",
            color: loading ? "#555" : "#fff",
            cursor: loading ? "default" : "pointer",
            fontWeight: 800,
          }}
        >
          {loading ? "Φόρτωση..." : "Ανανέωση"}
        </button>
      </div>

      {error ? (
        <div style={{ border: "1px solid #ffb4b4", background: "#fff1f1", color: "#8a1111", borderRadius: 12, padding: 12 }}>
          {error}
        </div>
      ) : null}

      {stats ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <StatCard label="Προβολές σελίδων" value={formatNumber(stats.totals.pageViews)} />
            <StatCard label="Μοναδικοί επισκέπτες" value={formatNumber(stats.totals.uniqueVisitors)} />
            <StatCard label="Requests" value={formatNumber(stats.totals.requests)} />
            <StatCard label="Bots / scripts" value={formatNumber(stats.totals.botRequests)} />
            <StatCard label="Σφάλματα" value={formatNumber(stats.totals.errorRequests)} note={`${stats.totals.errorRate}%`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)", gap: 12 }}>
            <MiniTable
              title="Πιο δημοφιλείς σελίδες"
              rows={stats.topPages}
              columns={[
                { key: "path", label: "Σελίδα" },
                { key: "views", label: "Προβολές", align: "right" },
              ]}
            />
            <div style={{ display: "grid", gap: 12 }}>
              <MiniTable
                title="Συσκευές"
                rows={stats.devices}
                columns={[
                  { key: "type", label: "Τύπος" },
                  { key: "count", label: "Προβολές", align: "right" },
                ]}
              />
              <MiniTable
                title="Browsers"
                rows={stats.browsers}
                columns={[
                  { key: "name", label: "Browser" },
                  { key: "count", label: "Προβολές", align: "right" },
                ]}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <MiniTable
              title="Status codes"
              rows={stats.statusCodes}
              columns={[
                { key: "status", label: "Status" },
                { key: "count", label: "Requests", align: "right" },
              ]}
            />
            <MiniTable
              title="Παραπομπές"
              rows={stats.referrers}
              columns={[
                { key: "host", label: "Host" },
                { key: "count", label: "Προβολές", align: "right" },
              ]}
              empty="Δεν βρέθηκαν εξωτερικές παραπομπές στο δείγμα."
            />
          </div>
        </>
      ) : !loading ? (
        <div style={{ color: "#666" }}>Δεν υπάρχουν δεδομένα.</div>
      ) : null}
    </div>
  );
}
