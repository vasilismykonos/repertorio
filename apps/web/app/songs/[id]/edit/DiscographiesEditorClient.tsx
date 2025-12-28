"use client";

import React, { useEffect, useRef, useState } from "react";

type ArtistOption = {
  id: number;
  title: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type DiscographyRow = {
  id?: number; // existing SongVersion id (δεν το εμφανίζουμε στο UI)
  year: string; // keep as string in UI
  youtubeSearch: string;

  // ✅ source of truth: arrays of NEW Artist IDs
  singerFrontIds: number[];
  singerBackIds: number[];
  solistIds: number[];
};

type Props = {
  songTitle: string;

  initialVersions: Array<{
    id: number;
    year: number | null;
    youtubeSearch: string | null;

    // display labels (optional, not source-of-truth)
    singerFront: string | null;
    singerBack: string | null;
    solist: string | null;

    // ✅ ids (source-of-truth)
    singerFrontIds?: number[] | null;
    singerBackIds?: number[] | null;
    solistIds?: number[] | null;
  }>;

  hiddenInputId: string;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

const YEAR_MIN = 1900;
const YEAR_MAX = 2050;

function uniqNums(ids: any[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const x of ids ?? []) {
    const n = Math.trunc(Number(x));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function toRow(v: Props["initialVersions"][number]): DiscographyRow {
  return {
    id: v.id,
    year: v.year != null ? String(v.year) : "",
    youtubeSearch: v.youtubeSearch ?? "",
    singerFrontIds: uniqNums(Array.isArray(v.singerFrontIds) ? v.singerFrontIds : []),
    singerBackIds: uniqNums(Array.isArray(v.singerBackIds) ? v.singerBackIds : []),
    solistIds: uniqNums(Array.isArray(v.solistIds) ? v.solistIds : []),
  };
}

function normalizeForSave(rows: DiscographyRow[]) {
  // Backend will drop fully empty rows.
  return rows.map((r) => ({
    id: typeof r.id === "number" ? r.id : null,
    year: (r.year ?? "").trim() || null,
    youtubeSearch: (r.youtubeSearch ?? "").trim() || null,

    singerFrontIds: uniqNums(r.singerFrontIds ?? []),
    singerBackIds: uniqNums(r.singerBackIds ?? []),
    solistIds: uniqNums(r.solistIds ?? []),
  }));
}

/**
 * Ανθεκτικό fetch για Artist search:
 * 1) GET /artists/search?q=...&take=...
 * 2) GET /artists?q=...&take=...
 * Payload: Array<Artist> ή { items: Artist[] }
 */
async function fetchArtistsSearch(q: string, take = 20): Promise<ArtistOption[]> {
  const query = encodeURIComponent(q.trim());
  const urls = [
    `${API_BASE_URL}/artists/search?q=${query}&take=${take}`,
    `${API_BASE_URL}/artists?q=${query}&take=${take}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);

      const arr: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];

      const mapped = arr
        .map((a) => ({
          id: Number(a?.id),
          title: String(a?.title ?? "").trim(),
          firstName: a?.firstName ?? null,
          lastName: a?.lastName ?? null,
        }))
        .filter((a) => Number.isFinite(a.id) && a.id > 0);

      const seen = new Set<number>();
      const out: ArtistOption[] = [];
      for (const a of mapped) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push(a);
      }
      return out;
    } catch {
      // try next url
    }
  }

  return [];
}

/**
 * Lookup Artist by ID (για τα ήδη επιλεγμένα IDs ώστε να εμφανίζονται chips με όνομα)
 * Υποθέτει endpoint GET /artists/:id
 */
async function fetchArtistById(id: number): Promise<ArtistOption | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/artists/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const a: any = await res.json().catch(() => null);
    if (!a) return null;

    const out: ArtistOption = {
      id: Number(a?.id),
      title: String(a?.title ?? "").trim(),
      firstName: a?.firstName ?? null,
      lastName: a?.lastName ?? null,
    };

    if (!Number.isFinite(out.id) || out.id <= 0) return null;
    return out;
  } catch {
    return null;
  }
}

function artistDisplay(a: ArtistOption): string {
  const full = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  const name = (full || a.title || "").trim();
  return name || "Καλλιτέχνης";
}

function clampYearStr(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (!/^\d{1,4}$/.test(s)) return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  const clamped = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.trunc(n)));
  return String(clamped);
}

function buildYouTubeSearchUrl(q: string): string {
  const query = encodeURIComponent((q ?? "").trim());
  return `https://www.youtube.com/results?search_query=${query}`;
}

function YouTubeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10 8.5v7l6-3.5-6-3.5z" />
      <path d="M21.6 7.2c.2.8.4 1.9.4 4.8s-.2 4-.4 4.8c-.2.9-.9 1.6-1.8 1.8-.8.2-3.6.4-7.8.4s-7-.2-7.8-.4c-.9-.2-1.6-.9-1.8-1.8C2.2 16 2 14.9 2 12s.2-4 .4-4.8c.2-.9.9-1.6 1.8-1.8C5 5.2 7.8 5 12 5s7 .2 7.8.4c.9.2 1.6.9 1.8 1.8z" />
    </svg>
  );
}

type PickerProps = {
  selectedIds: number[];
  onChange: (ids: number[]) => void;

  labelById: Map<number, string>;
  setLabelById: React.Dispatch<React.SetStateAction<Map<number, string>>>;
};

function ArtistIdPicker({ selectedIds, onChange, labelById, setLabelById }: PickerProps) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<ArtistOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastReq = useRef(0);

  // debounce search
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setOptions([]);
      setLoading(false);
      return;
    }

    const t = setTimeout(async () => {
      const reqId = Date.now();
      lastReq.current = reqId;
      setLoading(true);

      const res = await fetchArtistsSearch(text, 20);

      if (lastReq.current !== reqId) return;

      setOptions(res);
      setLoading(false);

      // update label map with results
      if (res.length) {
        setLabelById((prev) => {
          const next = new Map(prev);
          for (const a of res) next.set(a.id, artistDisplay(a));
          return next;
        });
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q, setLabelById]);

  function addId(id: number) {
    const next = uniqNums([...(selectedIds ?? []), id]);
    onChange(next);

    // ✅ ΖΗΤΟΥΜΕΝΟ: κλείσε dropdown και καθάρισε το search ώστε να συνεχίσεις με νέο
    setOpen(false);
    setQ("");
    setOptions([]);
    setLoading(false);
  }

  function removeId(id: number) {
    onChange((selectedIds ?? []).filter((x) => x !== id));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // μικρό delay για click σε option
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Αναζήτηση καλλιτέχνη (π.χ. Τσιτσάνης)"
          style={{ flex: 1 }}
        />
        {loading ? <small style={{ opacity: 0.7 }}>...</small> : null}
      </div>

      {open && q.trim() ? (
        <div
          style={{
            border: "1px solid #444",
            borderRadius: 10,
            marginTop: 6,
            padding: 6,
            background: "#0b0b0b",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {options.length === 0 && !loading ? (
            <div style={{ opacity: 0.8, padding: 6 }}>Δεν βρέθηκαν αποτελέσματα.</div>
          ) : (
            options.map((a) => {
              const isSelected = selectedIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // keep focus
                  onClick={() => {
                    if (!isSelected) addId(a.id);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid transparent",
                    background: isSelected ? "#1a1a1a" : "transparent",
                    cursor: isSelected ? "default" : "pointer",
                  }}
                >
                  <strong>{artistDisplay(a)}</strong>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {/* Selected chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {selectedIds.length === 0 ? (
          <small style={{ opacity: 0.75 }}>Κανένας επιλεγμένος.</small>
        ) : (
          selectedIds.map((id) => (
            <span
              key={id}
              style={{
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                border: "1px solid #444",
                borderRadius: 999,
                padding: "2px 8px",
                opacity: 0.95,
              }}
            >
              <span>{labelById.get(id) || "Καλλιτέχνης"}</span>
              <button
                type="button"
                onClick={() => removeId(id)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  opacity: 0.8,
                }}
                aria-label="remove"
                title="Αφαίρεση"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export default function DiscographiesEditorClient({
  songTitle,
  initialVersions,
  hiddenInputId,
}: Props) {
  const [rows, setRows] = useState<DiscographyRow[]>([]);

  // ✅ reflect props
  useEffect(() => {
    setRows((initialVersions ?? []).map(toRow));
  }, [initialVersions]);

  // label map για να εμφανίζονται ονόματα στα chips
  const [labelById, setLabelById] = useState<Map<number, string>>(() => new Map());

  // Track manual override youtubeSearch per row
  const [youtubeTouched, setYoutubeTouched] = useState<Record<string, boolean>>({});

  function rowKey(r: DiscographyRow, idx: number) {
    return `${typeof r.id === "number" ? r.id : "new"}-${idx}`;
  }

  function computeYoutubeSearch(r: DiscographyRow): string {
    const parts: string[] = [];
    const title = String(songTitle ?? "").trim();
    if (title) parts.push(title);

    const names: string[] = [];
    const addNames = (ids: number[]) => {
      for (const id of ids ?? []) {
        const label = (labelById.get(id) || "").trim();
        if (label) names.push(label);
      }
    };

    addNames(r.singerFrontIds);
    addNames(r.singerBackIds);
    addNames(r.solistIds);

    const uniqNames = Array.from(new Set(names)).filter(Boolean);
    if (uniqNames.length) parts.push(uniqNames.join(" "));

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  // 1) sync hidden input
  useEffect(() => {
    const el = document.getElementById(hiddenInputId) as HTMLInputElement | null;
    if (!el) return;
    el.value = JSON.stringify(normalizeForSave(rows));
  }, [rows, hiddenInputId]);

  // 2) resolve labels για ΟΛΑ τα selected ids
  useEffect(() => {
    const allIds = new Set<number>();
    for (const r of rows) {
      for (const id of r.singerFrontIds) allIds.add(id);
      for (const id of r.singerBackIds) allIds.add(id);
      for (const id of r.solistIds) allIds.add(id);
    }

    const missing = Array.from(allIds).filter((id) => !labelById.has(id));
    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      const updates: Array<[number, string]> = [];

      for (const id of missing.slice(0, 200)) {
        const a = await fetchArtistById(id);
        if (!a) continue;
        const label = artistDisplay(a).trim();
        if (!label) continue;
        updates.push([id, label]);
      }

      if (cancelled) return;
      if (!updates.length) return;

      setLabelById((prev) => {
        const next = new Map(prev);
        for (const [id, label] of updates) next.set(id, label);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, labelById]);

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        year: "",
        youtubeSearch: "",
        singerFrontIds: [],
        singerBackIds: [],
        solistIds: [],
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<DiscographyRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 10,
        padding: 12,
        background: "#0f0f0f",
      }}
    >
      {rows.length === 0 ? (
        <p style={{ opacity: 0.85, marginTop: 0 }}>Δεν υπάρχουν δισκογραφίες.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r, idx) => {
            const key = rowKey(r, idx);
            const touched = !!youtubeTouched[key];

            const autoYoutube = computeYoutubeSearch(r);
            const youtubeValue = touched ? r.youtubeSearch : r.youtubeSearch || autoYoutube;
            const youtubeQuery = (youtubeValue ?? "").trim();
            const youtubeHref = youtubeQuery ? buildYouTubeSearchUrl(youtubeQuery) : "";

            return (
              <div
                key={key}
                style={{
                  border: "1px solid #444",
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <strong>Δισκογραφία</strong>

                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    style={{
                      marginLeft: "auto",
                      border: "1px solid #555",
                      borderRadius: 8,
                      background: "transparent",
                      cursor: "pointer",
                      padding: "4px 10px",
                    }}
                  >
                    Αφαίρεση
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "200px 1fr",
                    gap: 8,
                    alignItems: "start",
                  }}
                >
                  <label style={{ opacity: 0.9, paddingTop: 6 }}>YouTube search</label>

                  {/* input + youtube icon button */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={youtubeValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setYoutubeTouched((prev) => ({ ...prev, [key]: true }));
                        updateRow(idx, { youtubeSearch: val });
                      }}
                      placeholder="Συμπληρώνεται αυτόματα από τίτλο + ερμηνευτές"
                      style={{ flex: 1 }}
                    />

                    <a
                      href={youtubeHref || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!youtubeHref}
                      title={
                        youtubeHref
                          ? "Αναζήτηση στο YouTube"
                          : "Δεν υπάρχει query για αναζήτηση"
                      }
                      onClick={(e) => {
                        if (!youtubeHref) e.preventDefault();
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 36,
                        height: 36,
                        border: "1px solid #555",
                        borderRadius: 10,
                        textDecoration: "none",
                        opacity: youtubeHref ? 0.95 : 0.4,
                        cursor: youtubeHref ? "pointer" : "not-allowed",
                      }}
                    >
                      <YouTubeIcon />
                    </a>
                  </div>

                  <div style={{ opacity: 0.9, paddingTop: 6 }}>Ερμηνευτές (Front)</div>
                  <ArtistIdPicker
                    selectedIds={r.singerFrontIds}
                    onChange={(ids) => updateRow(idx, { singerFrontIds: ids })}
                    labelById={labelById}
                    setLabelById={setLabelById}
                  />

                  <div style={{ opacity: 0.9, paddingTop: 6 }}>Ερμηνευτές (Back)</div>
                  <ArtistIdPicker
                    selectedIds={r.singerBackIds}
                    onChange={(ids) => updateRow(idx, { singerBackIds: ids })}
                    labelById={labelById}
                    setLabelById={setLabelById}
                  />

                  <div style={{ opacity: 0.9, paddingTop: 6 }}>Σολίστες</div>
                  <ArtistIdPicker
                    selectedIds={r.solistIds}
                    onChange={(ids) => updateRow(idx, { solistIds: ids })}
                    labelById={labelById}
                    setLabelById={setLabelById}
                  />

                  {/* ✅ Έτος τελευταίο */}
                  <label style={{ color: "#fff", paddingTop: 6 }}>Έτος</label>
                  <input
                    value={r.year}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const cleaned = raw.replace(/[^\d]/g, "").slice(0, 4);
                      updateRow(idx, { year: cleaned });
                    }}
                    onBlur={() => {
                      const clamped = clampYearStr(r.year);
                      if (clamped !== r.year) updateRow(idx, { year: clamped });
                    }}
                    placeholder="π.χ. 1968"
                    inputMode="numeric"
                    min={YEAR_MIN}
                    max={YEAR_MAX}
                    style={{ maxWidth: 120 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 12, borderTop: "1px solid #333", paddingTop: 12 }}>
        <button type="button" onClick={addRow}>
          Προσθήκη δισκογραφίας
        </button>
      </div>
    </div>
  );
}
