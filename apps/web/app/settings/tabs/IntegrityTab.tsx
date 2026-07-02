"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CheckStatus = "ok" | "warning" | "critical";

type IntegrityCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  count?: number;
  message: string;
  solution?: string;
  fixAction?: string;
  fixLabel?: string;
  details?: string[];
};

type IntegrityPayload = {
  ok: boolean;
  generatedAt: string;
  durationMs: number;
  status: CheckStatus;
  score: number;
  totals: Record<string, number>;
  checks: IntegrityCheck[];
};

const statusLabel: Record<CheckStatus, string> = {
  ok: "Εντάξει",
  warning: "Προσοχή",
  critical: "Κρίσιμο",
};

const statusColor: Record<CheckStatus, string> = {
  ok: "#15803d",
  warning: "#b45309",
  critical: "#b91c1c",
};

const totalLabels: Record<string, string> = {
  users: "Χρήστες",
  songs: "Τραγούδια",
  publishedSongs: "Δημοσιευμένα",
  pendingSongs: "Σε αναμονή",
  lists: "Λίστες",
  listItems: "Τραγούδια σε λίστες",
  assets: "Υλικά",
  notifications: "Ενημερώσεις",
  pushSubscriptions: "Push συσκευές",
  chatThreads: "Συνομιλίες",
  chatMessages: "Μηνύματα chat",
};

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("el-GR").format(Number(value || 0));
}

function formatDate(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function StatusPill({ status }: { status: CheckStatus }) {
  const color = statusColor[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${color}`,
        color,
        borderRadius: 999,
        padding: "3px 9px",
        fontWeight: 800,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      {statusLabel[status]}
    </span>
  );
}

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, background: "#fff", padding: 14 }}>
      <div style={{ color: "#555", fontSize: 13, fontWeight: 800 }}>{label}</div>
      <div style={{ color: "#111", fontSize: 26, fontWeight: 950, marginTop: 6 }}>{value}</div>
      {note ? <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>{note}</div> : null}
    </div>
  );
}

export default function IntegrityTab() {
  const [data, setData] = useState<IntegrityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/integrity", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
      setData(json as IntegrityPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία ελέγχου ακεραιότητας.");
    } finally {
      setLoading(false);
    }
  }, []);

  const repair = useCallback(
    async (check: IntegrityCheck) => {
      if (!check.fixAction) return;
      const confirmed = window.confirm(
        `Να εκτελεστεί η διόρθωση;\n\n${check.label}\n${check.solution || ""}`,
      );
      if (!confirmed) return;

      setRepairing(check.fixAction);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/admin/integrity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: check.fixAction }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
        setNotice(`${json?.message || "Η διόρθωση ολοκληρώθηκε."} Επηρεάστηκαν: ${formatNumber(json?.affected)}.`);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Αποτυχία διόρθωσης.");
      } finally {
        setRepairing(null);
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const problemChecks = useMemo(
    () => (data?.checks || []).filter((check) => check.status !== "ok"),
    [data],
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fff",
          padding: 14,
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: "#111" }}>Έλεγχος ακεραιότητας</h2>
          <p style={{ margin: "6px 0 0", color: "#555" }}>
            Εκτελείται μόνο όταν ανοίγει αυτό το tab ή όταν πατάς ανανέωση.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            border: "1px solid #111",
            borderRadius: 10,
            background: loading ? "#eee" : "#111",
            color: loading ? "#555" : "#fff",
            padding: "9px 14px",
            fontWeight: 900,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Έλεγχος..." : "Ανανέωση"}
        </button>
      </div>

      {error ? (
        <div style={{ border: "1px solid #fecaca", borderRadius: 12, background: "#fff1f2", color: "#991b1b", padding: 14, fontWeight: 800 }}>
          {error}
        </div>
      ) : null}

      {notice ? (
        <div style={{ border: "1px solid #bbf7d0", borderRadius: 12, background: "#f0fdf4", color: "#166534", padding: 14, fontWeight: 800 }}>
          {notice}
        </div>
      ) : null}

      {data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <Card label="Κατάσταση" value={statusLabel[data.status]} note={`Score ${formatNumber(data.score)}/100`} />
            <Card label="Προβλήματα" value={formatNumber(problemChecks.length)} note="Κρίσιμα ή προειδοποιήσεις" />
            <Card label="Διάρκεια" value={`${formatNumber(data.durationMs)} ms`} note="Χρόνος ελέγχου" />
            <Card label="Τελευταίος έλεγχος" value={formatDate(data.generatedAt)} />
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #eee", fontWeight: 950, color: "#111" }}>
              Έλεγχοι
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", color: "#111", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Έλεγχος</th>
                    <th style={{ textAlign: "left", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Κατάσταση</th>
                    <th style={{ textAlign: "right", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Πλήθος</th>
                    <th style={{ textAlign: "left", padding: "9px 12px", borderBottom: "1px solid #eee", color: "#555" }}>Μήνυμα</th>
                  </tr>
                </thead>
                <tbody>
                  {data.checks.map((check, index) => (
                    <tr key={check.id}>
                      <td style={{ padding: "10px 12px", borderBottom: index === data.checks.length - 1 ? "none" : "1px solid #f1f1f1", fontWeight: 800 }}>
                        {check.label}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: index === data.checks.length - 1 ? "none" : "1px solid #f1f1f1" }}>
                        <StatusPill status={check.status} />
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: index === data.checks.length - 1 ? "none" : "1px solid #f1f1f1", textAlign: "right", fontWeight: 800 }}>
                        {typeof check.count === "number" ? formatNumber(check.count) : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: index === data.checks.length - 1 ? "none" : "1px solid #f1f1f1", color: "#444" }}>
                        {check.message}
                        {check.solution ? (
                          <div style={{ marginTop: 6, color: "#111", fontSize: 13, fontWeight: 700 }}>
                            Λύση: <span style={{ color: "#444", fontWeight: 600 }}>{check.solution}</span>
                          </div>
                        ) : null}
                        {check.details?.length ? (
                          <div style={{ marginTop: 6, color: "#666", fontSize: 12, display: "grid", gap: 3 }}>
                            {check.details.map((detail) => (
                              <code
                                key={detail}
                                style={{
                                  display: "block",
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                  background: "#f6f6f6",
                                  border: "1px solid #eee",
                                  borderRadius: 6,
                                  padding: "4px 6px",
                                }}
                              >
                                {detail}
                              </code>
                            ))}
                          </div>
                        ) : null}
                        {check.fixAction ? (
                          <button
                            type="button"
                            onClick={() => void repair(check)}
                            disabled={repairing === check.fixAction}
                            style={{
                              marginTop: 8,
                              border: "1px solid #111",
                              borderRadius: 8,
                              background: repairing === check.fixAction ? "#eee" : "#111",
                              color: repairing === check.fixAction ? "#555" : "#fff",
                              padding: "6px 10px",
                              fontWeight: 900,
                              cursor: repairing === check.fixAction ? "default" : "pointer",
                            }}
                          >
                            {repairing === check.fixAction ? "Διορθώνεται..." : check.fixLabel || "Διόρθωση"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 12, background: "#fff", padding: 14 }}>
            <div style={{ fontWeight: 950, color: "#111", marginBottom: 10 }}>Σύνολα συστήματος</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {Object.entries(data.totals).map(([key, value]) => (
                <div key={key} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  <div style={{ color: "#666", fontSize: 12, fontWeight: 800 }}>{totalLabels[key] || key}</div>
                  <div style={{ color: "#111", fontSize: 20, fontWeight: 950, marginTop: 4 }}>{formatNumber(value)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : loading ? (
        <div style={{ color: "#555", padding: 14 }}>Γίνεται έλεγχος...</div>
      ) : null}
    </div>
  );
}
