// apps/web/app/songs/[id]/SongSingerTunesClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { A } from "@/app/components/buttons";
import { parseTonicity } from "@/app/components/tonicity";

type SingerTuneRow = {
  id: number;
  songId: number;
  title: string;
  tune: string;
  createdByUserId: number | null;
  createdBy: { id: number; name: string; avatarUrl?: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

type RepSelected = { tonicity: string | null };

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function readSelectedFromGlobal(): RepSelected {
  if (typeof window === "undefined") return { tonicity: null };
  const w = window as any;
  const ton = parseTonicity(w.__repSelectedTonicity);
  return { tonicity: ton };
}

function dispatchTonicityChanged(tonicity: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rep:tonicityChanged", { detail: { tonicity } }));
}

export default function SongSingerTunesClient(props: {
  open: boolean;
  songId: number;
  originalKeySign: "+" | "-" | null;
}) {
  const { open, songId, originalKeySign } = props;
  const { status } = useSession();

  const [rows, setRows] = useState<SingerTuneRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [selected, setSelected] = useState<RepSelected>(() => readSelectedFromGlobal());

  // Φόρτωση denos
  useEffect(() => {
    if (!open) return;
    if (status === "loading") {
      setErr(null);
      setAuthRequired(false);
      setRows(null);
      return;
    }
    if (status === "unauthenticated") {
      setErr(null);
      setAuthRequired(true);
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setErr(null);
      setAuthRequired(false);
      try {
        const res = await fetch(`/api/songs/${songId}/singer-tunes`, { cache: "no-store" });
        const data = await readJson(res);
        if (!res.ok) {
          if (!cancelled) {
            if (res.status === 401) {
              setAuthRequired(true);
              setRows([]);
              setErr(null);
              return;
            }
            const msg =
              data && typeof data === "object" && ("error" in data || "message" in data)
                ? String((data as any).error || (data as any).message)
                : `HTTP ${res.status}`;
            throw new Error(msg);
          }
        }
        if (!cancelled) {
          setRows(Array.isArray(data) ? (data as SingerTuneRow[]) : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setErr(e?.message || "Αποτυχία φόρτωσης");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, songId, status]);

  // Ακούμε αλλαγές τονικότητας
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const onChange = (ev: Event) => {
      const ce = ev as CustomEvent;
      const detail = ce.detail as { tonicity?: string | null } | undefined;
      const ton = parseTonicity(detail?.tonicity);
      setSelected({ tonicity: ton });
    };
    window.addEventListener("rep:tonicityChanged", onChange as EventListener);
    setSelected(readSelectedFromGlobal());
    return () => window.removeEventListener("rep:tonicityChanged", onChange as EventListener);
  }, [open]);

  function applyTune(r: SingerTuneRow) {
    if (status !== "authenticated") return;
    const ton = parseTonicity(r.tune);
    if (!ton) return;
    if (typeof window === "undefined") return;
    const w = window as any;
    if (typeof w.__repSetSelectedTonicity === "function") {
      w.__repSetSelectedTonicity(ton);
      return;
    }
    w.__repSelectedTonicity = ton;
    dispatchTonicityChanged(ton);
  }

  if (!open) return null;

  const signLabel = originalKeySign ?? "";
  const hasAny = (rows?.length ?? 0) > 0;

  return (
    <section style={{ marginBottom: 14 }}>
      <div
        style={{
          background: "#111",
          border: "1px solid #333",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 700 }}>Τονικότητες</div>
          {status === "authenticated"
            ? A.editLink({
                href: `/songs/${songId}/singer-tunes`,
                title: "Διαχείριση τονικοτήτων",
                label: "Επεξεργασία",
              })
            : null}
        </div>

        {authRequired ? (
          <div style={{ opacity: 0.9 }}>
            Απαιτείται σύνδεση για προβολή/εφαρμογή τονικοτήτων.
          </div>
        ) : err ? (
          <div style={{ opacity: 0.85, marginBottom: 8 }}>
            Σφάλμα: <span style={{ fontWeight: 600 }}>{err}</span>
          </div>
        ) : null}

        {authRequired ? null : rows === null ? (
          <div style={{ opacity: 0.85 }}>Φόρτωση…</div>
        ) : !hasAny ? (
          <div style={{ opacity: 0.85 }}>Δεν υπάρχουν καταχωρήσεις.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(rows ?? []).map((r) => {
              const ton = parseTonicity(r.tune) ?? r.tune?.trim() ?? "";
              const isSelected = Boolean(ton && selected.tonicity && ton === selected.tonicity);

              return (
                <button
                  key={r.id}
                  type="button"
                  className={"singer-tune-btn" + (isSelected ? " selected" : "")}
                  onClick={() => applyTune(r)}
                  title={`Εφαρμογή τονικότητας ${ton}${signLabel} (${r.title})`}
                >
                  <span className="name">{r.title}</span>
                  <span className="sep"> </span>
                  <span className="tune">
                    {ton}
                    {signLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .singer-tune-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #222;
          color: #fff;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 6px 10px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: 0.2s;
          max-width: 100%;
        }
        .singer-tune-btn:hover {
          background: #444;
        }
        .singer-tune-btn.selected {
          background: #ff4747 !important;
          border-color: #ff4747 !important;
          color: #fff !important;
          font-weight: 700;
        }
        .name {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }
        .sep {
          opacity: 0.7;
        }
        .tune {
          font-weight: 800;
          white-space: nowrap;
        }
        @media (max-width: 520px) {
          .name {
            max-width: 170px;
          }
        }
      `}</style>
    </section>
  );
}
