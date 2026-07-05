// apps/web/app/songs/[id]/SongSingerTunesClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { A } from "@/app/components/buttons";
import { parseTonicity } from "@/app/components/tonicity";
import {
  readOfflineMeta,
  readOfflineSingerTunes,
  writeOfflineSingerTunes,
} from "@/lib/offlineStore";

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

function browserOnline() {
  return typeof navigator === "undefined" || typeof navigator.onLine === "undefined"
    ? true
    : navigator.onLine;
}

function hasOfflineUser(meta: { userId?: number | null; userEmail?: string | null } | null) {
  return Number(meta?.userId) > 0 && String(meta?.userEmail || "").trim() !== "";
}

export default function SongSingerTunesClient(props: {
  open: boolean;
  songId: number;
  originalKeySign: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  initialRows?: SingerTuneRow[] | null;
  initialRowsLoaded?: boolean;
  initialAuthRequired?: boolean;
}) {
  const {
    open,
    songId,
    originalKeySign,
    selectedSingerTuneId = null,
    selectedTonicity = null,
    selectedTonicitySign = null,
    initialRows = null,
    initialRowsLoaded = false,
    initialAuthRequired = false,
  } = props;
  const { status } = useSession();
  const hasInitialRows = Boolean(initialRowsLoaded && Array.isArray(initialRows));
  const selectedSingerTuneIdNumber = Number(selectedSingerTuneId || 0);
  const selectedTonicityFromList = parseTonicity(selectedTonicity);

  const [rows, setRows] = useState<SingerTuneRow[] | null>(() => (hasInitialRows ? initialRows : null));
  const [err, setErr] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(initialAuthRequired);
  const [usingOfflineUser, setUsingOfflineUser] = useState(false);

  const [selected, setSelected] = useState<RepSelected>(() => readSelectedFromGlobal());

  // Φόρτωση τονικοτήτων με άμεσο cached fallback και online refresh.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      if (hasInitialRows) {
        if (!cancelled) {
          setErr(null);
          setAuthRequired(false);
          setUsingOfflineUser(false);
          setRows(initialRows);
          void writeOfflineSingerTunes(songId, initialRows ?? []).catch(() => null);
        }
        return;
      }

      const online = browserOnline();
      const meta = await readOfflineMeta().catch(() => null);
      const canUseOfflineUser = hasOfflineUser(meta) && !online;
      const cachedRows = !online
        ? await readOfflineSingerTunes(songId).catch(() => null)
        : null;

      if (!cancelled) {
        setErr(null);
        setAuthRequired(false);
        setUsingOfflineUser(!online && canUseOfflineUser);
        setRows(!online && Array.isArray(cachedRows) ? (cachedRows as SingerTuneRow[]) : null);
      }

      if (!online) {
        if (!cancelled) {
          setUsingOfflineUser(canUseOfflineUser);
          setRows(Array.isArray(cachedRows) ? (cachedRows as SingerTuneRow[]) : []);
        }
        return;
      }

      try {
        const res = await fetch(`/api/songs/${songId}/singer-tunes`, { cache: "no-store" });
        const data = await readJson(res);
        if (!res.ok) {
          if (!cancelled) {
            if (res.status === 401) {
              if (status === "loading") return;
              setAuthRequired(true);
              setRows([]);
              setErr(null);
              setUsingOfflineUser(false);
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
          const nextRows = Array.isArray(data) ? (data as SingerTuneRow[]) : [];
          setRows(nextRows);
          setUsingOfflineUser(false);
          void writeOfflineSingerTunes(songId, nextRows).catch(() => null);
        }
      } catch (e: any) {
        if (!cancelled) {
          const fallbackRows = await readOfflineSingerTunes(songId).catch(() => null);
          if (Array.isArray(fallbackRows) && hasOfflineUser(meta)) {
            setRows(fallbackRows as SingerTuneRow[]);
            setUsingOfflineUser(true);
            setErr(null);
          } else {
            setRows([]);
            setUsingOfflineUser(false);
            setErr(e?.message || "Αποτυχία φόρτωσης");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, songId, status, hasInitialRows, initialRows]);

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
    if (status !== "authenticated" && !usingOfflineUser && !hasInitialRows) return;
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
  const selectedSignLabel = selectedTonicitySign ?? originalKeySign ?? "";
  const hasAny = (rows?.length ?? 0) > 0;
  const hasSelectedRow =
    hasAny &&
    (rows ?? []).some((r) => {
      const ton = parseTonicity(r.tune) ?? r.tune?.trim() ?? "";
      if (
        selectedSingerTuneIdNumber > 0 &&
        Number(r.id) === selectedSingerTuneIdNumber
      ) {
        return true;
      }
      return Boolean(
        selectedSingerTuneIdNumber <= 0 &&
          selectedTonicityFromList &&
          ton &&
          ton === selectedTonicityFromList,
      );
    });
  const showListSelectedFallback = Boolean(selectedTonicityFromList && !hasSelectedRow);

  function applyListSelectedTune() {
    const ton = selectedTonicityFromList;
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
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 700 }}>Τονικότητες</div>
          {(status === "authenticated" || hasInitialRows) && !usingOfflineUser
            ? A.editLink({
                href: `/songs/${songId}/singer-tunes`,
	                title: "Διαχείριση τονικοτήτων",
	                label: "Επεξεργασία",
	                iconOnly: true,
	                style: {
	                  width: 32,
	                  height: 32,
	                  minWidth: 32,
	                  padding: 0,
	                  borderRadius: 8,
	                },
	              })
            : null}
        </div>

        {authRequired && !showListSelectedFallback ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ opacity: 0.9 }}>
              Απαιτείται σύνδεση για προβολή/εφαρμογή τονικοτήτων.
            </div>
            {A.login({
              title: "Σύνδεση για τονικότητες",
              label: "Σύνδεση",
              showLabel: true,
              style: {
                width: "fit-content",
                maxWidth: "100%",
                alignSelf: "flex-start",
                justifySelf: "flex-start",
                paddingLeft: 12,
                paddingRight: 12,
              },
            })}
          </div>
        ) : err && !showListSelectedFallback ? (
          <div style={{ opacity: 0.85, marginBottom: 8 }}>
            Σφάλμα: <span style={{ fontWeight: 600 }}>{err}</span>
          </div>
        ) : null}

        {rows === null && !showListSelectedFallback ? (
          <div style={{ opacity: 0.85 }}>Φόρτωση…</div>
        ) : !hasAny && !showListSelectedFallback ? (
          <div style={{ opacity: 0.85 }}>Δεν υπάρχουν καταχωρήσεις.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {showListSelectedFallback ? (
              <button
                type="button"
                className="singer-tune-btn selected"
                onClick={applyListSelectedTune}
                title={`Επιλεγμένη τονικότητα λίστας ${selectedTonicityFromList}${selectedSignLabel}`}
              >
                <span className="name">Επιλογή λίστας</span>
                <span className="sep"> </span>
                <span className="tune">
                  {selectedTonicityFromList}
                  {selectedSignLabel}
                </span>
              </button>
            ) : null}
            {(rows ?? []).map((r) => {
              const ton = parseTonicity(r.tune) ?? r.tune?.trim() ?? "";
              const selectedBySingerTune =
                Number.isFinite(selectedSingerTuneIdNumber) &&
                selectedSingerTuneIdNumber > 0 &&
                Number(r.id) === selectedSingerTuneIdNumber;
              const isSelected =
                selectedBySingerTune ||
                Boolean(
                  !selectedBySingerTune &&
                    selectedSingerTuneIdNumber <= 0 &&
                    ton &&
                    selected.tonicity &&
                    ton === selected.tonicity,
                );

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
