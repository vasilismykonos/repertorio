"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UserActivityRow = {
  id: number;
  label: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  role: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSessionAt: string;
  sessionCount: number;
  activeMinutes: number;
  secondsAgo: number;
};

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
  dailyTraffic: Array<{
    date: string;
    pageViews: number;
    uniqueVisitors: number;
    requests: number;
    botRequests: number;
    errorRequests: number;
  }>;
  userStats: null | {
    generatedAt: string;
    window: {
      onlineMinutes: number;
      activeTodayHours: number;
      activeWeekDays: number;
    };
    totals: {
      knownUsers: number;
      onlineUsers: number;
      activeToday: number;
      activeWeek: number;
    };
    recentUsers: UserActivityRow[];
    frequentUsers: UserActivityRow[];
  };
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

function formatDay(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("el-GR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function userLabel(row: UserActivityRow) {
  const secondary = row.email || row.username;
  return secondary && secondary !== row.label ? `${row.label} · ${secondary}` : row.label;
}

function formatMinutes(value: number) {
  const minutes = Number(value || 0);
  if (minutes < 60) return `${formatNumber(minutes)} λ.`;
  const hours = minutes / 60;
  return `${new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 }).format(hours)} ώρες`;
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
  columns: Array<{ key: string; label: string; align?: "left" | "right"; render?: (row: any) => string }>;
  empty?: string;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee", fontWeight: 900, color: "#111" }}>
        {title}
      </div>
      {rows.length ? (
        <div style={{ overflowX: "auto" }}>
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
                      whiteSpace: "nowrap",
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
                  {columns.map((col) => {
                    const value = col.render ? col.render(row) : row[col.key];
                    return (
                      <td
                        key={col.key}
                        style={{
                          textAlign: col.align || "left",
                          padding: "9px 12px",
                          borderBottom: index === rows.length - 1 ? "none" : "1px solid #f1f1f1",
                          wordBreak: col.key === "path" || col.key === "user" ? "break-word" : "normal",
                          verticalAlign: "top",
                        }}
                      >
                        {typeof value === "number" ? formatNumber(value) : value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 14, color: "#666" }}>{empty || "Δεν υπάρχουν δεδομένα."}</div>
      )}
    </div>
  );
}

function DailyTrafficTable({ rows }: { rows: NonNullable<TrafficStats["dailyTraffic"]> }) {
  const maxViews = Math.max(1, ...rows.map((row) => row.pageViews));

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee", fontWeight: 900, color: "#111" }}>
        Καθημερινή επισκεψιμότητα
      </div>
      {rows.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "#111", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Ημέρα</th>
                <th style={{ textAlign: "left", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555", minWidth: 180 }}>Προβολές</th>
                <th style={{ textAlign: "right", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Επισκέπτες</th>
                <th style={{ textAlign: "right", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Requests</th>
                <th style={{ textAlign: "right", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Σφάλματα</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice()
                .reverse()
                .map((row, index) => {
                  const width = `${Math.max(4, Math.round((row.pageViews / maxViews) * 100))}%`;
                  return (
                    <tr key={row.date}>
                      <td style={{ padding: "9px 12px", borderBottom: index === rows.length - 1 ? "none" : "1px solid #f1f1f1", whiteSpace: "nowrap" }}>
                        {formatDay(row.date)}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: index === rows.length - 1 ? "none" : "1px solid #f1f1f1" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#eee", overflow: "hidden", minWidth: 90 }}>
                            <div style={{ width, height: "100%", borderRadius: 999, background: "#111" }} />
                          </div>
                          <strong style={{ minWidth: 44, textAlign: "right" }}>{formatNumber(row.pageViews)}</strong>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", padding: "9px 12px", borderBottom: index === rows.length - 1 ? "none" : "1px solid #f1f1f1" }}>
                        {formatNumber(row.uniqueVisitors)}
                      </td>
                      <td style={{ textAlign: "right", padding: "9px 12px", borderBottom: index === rows.length - 1 ? "none" : "1px solid #f1f1f1" }}>
                        {formatNumber(row.requests)}
                      </td>
                      <td style={{ textAlign: "right", padding: "9px 12px", borderBottom: index === rows.length - 1 ? "none" : "1px solid #f1f1f1" }}>
                        {formatNumber(row.errorRequests)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 14, color: "#666" }}>Δεν υπάρχουν ημερήσια δεδομένα στο δείγμα.</div>
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

  const userStats = stats?.userStats ?? null;

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
            Ελαφριά σύνοψη από access logs και από το υπάρχον heartbeat συνδεδεμένων χρηστών.
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <StatCard label="Online χρήστες" value={formatNumber(userStats?.totals.onlineUsers ?? 0)} note="τελευταία 5 λεπτά" />
            <StatCard label="Συνδεδεμένοι σήμερα" value={formatNumber(userStats?.totals.activeToday ?? 0)} note="με heartbeat 24ώρου" />
            <StatCard label="Συνδεδεμένοι 7 ημερών" value={formatNumber(userStats?.totals.activeWeek ?? 0)} />
            <StatCard label="Χρήστες βάσης" value={formatNumber(userStats?.totals.knownUsers ?? 0)} />
          </div>

          {!userStats ? (
            <div style={{ border: "1px solid #eee", background: "#fff", borderRadius: 12, padding: 12, color: "#666" }}>
              Τα στατιστικά χρηστών δεν είναι διαθέσιμα αυτή τη στιγμή. Η επισκεψιμότητα σελίδων συνεχίζει κανονικά.
            </div>
          ) : null}

          {userStats ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
              <MiniTable
                title="Πρόσφατοι συνδεδεμένοι χρήστες"
                rows={userStats.recentUsers}
                columns={[
                  { key: "user", label: "Χρήστης", render: userLabel },
                  { key: "lastSeenAt", label: "Τελευταία εμφάνιση", render: (row) => formatDate(row.lastSeenAt) },
                  { key: "sessionCount", label: "Συνδέσεις", align: "right" },
                ]}
              />
              <MiniTable
                title="Συχνοί χρήστες"
                rows={userStats.frequentUsers}
                columns={[
                  { key: "user", label: "Χρήστης", render: userLabel },
                  { key: "activeMinutes", label: "Χρόνος", align: "right", render: (row) => formatMinutes(row.activeMinutes) },
                  { key: "sessionCount", label: "Συνδέσεις", align: "right" },
                ]}
              />
            </div>
          ) : null}

          <DailyTrafficTable rows={stats.dailyTraffic || []} />

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
