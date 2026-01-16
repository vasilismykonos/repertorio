"use client";

import React, { useEffect, useRef, useState } from "react";

import { A } from "@/app/components/buttons";

type ArtistOption = {
  id: number;
  title: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type DiscographyRow = {
  id?: number; // existing SongVersion id (δεν το εμφανίζουμε στο UI)
  year: string; // keep as string in UI

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

/**
 * ✅ NEW ARCH RULE:
 * Client-side calls MUST stay same-origin to avoid CORS / wrong domain.
 * Nginx proxies /api/v1 -> Nest API.
 */
const API_BASE_URL = "/api/v1";

const YEAR_MIN = 1900;
const YEAR_MAX = 2050;

// ✅ UI sizing knobs
const PICKER_INPUT_MAX_WIDTH = 360;
const CHIP_FONT_SIZE = 12;
const CHIP_PADDING = "1px 8px";
const CHIP_REMOVE_FONT_SIZE = 14;

function cleanName(s: any): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

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
    singerFrontIds: uniqNums(
      Array.isArray(v.singerFrontIds) ? v.singerFrontIds : [],
    ),
    singerBackIds: uniqNums(
      Array.isArray(v.singerBackIds) ? v.singerBackIds : [],
    ),
    solistIds: uniqNums(Array.isArray(v.solistIds) ? v.solistIds : []),
  };
}

function normalizeForSave(rows: DiscographyRow[]) {
  // Backend will drop fully empty rows.
  return rows.map((r) => ({
    id: typeof r.id === "number" ? r.id : null,
    year: (r.year ?? "").trim() || null,

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
  if (!query) return [];

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
 * Lookup Artist by ID
 * Υποθέτει endpoint GET /artists/:id
 */
async function fetchArtistById(id: number): Promise<ArtistOption | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/artists/${id}`, {
      cache: "no-store",
    });
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

async function createArtistWithNames(args: {
  firstName: string | null;
  lastName: string; // required
}): Promise<ArtistOption> {
  const firstName = cleanName(args.firstName ?? "") || null;
  const lastName = cleanName(args.lastName);

  if (!lastName) {
    throw new Error("Το Επώνυμο είναι υποχρεωτικό.");
  }

  const res = await fetch(`${API_BASE_URL}/artists`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      firstName: firstName ?? null,
      lastName: lastName ?? null,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Create artist failed: ${res.status} ${text}`);
  }

  const a: any = await res.json().catch(() => null);
  if (!a || !Number.isFinite(Number(a?.id))) {
    throw new Error("Create artist failed: invalid response");
  }

  return {
    id: Number(a.id),
    title: String(a?.title ?? "").trim(),
    firstName: a?.firstName ?? null,
    lastName: a?.lastName ?? null,
  };
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

function CreateArtistModal(props: {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onCreated: (a: ArtistOption) => void;
}) {
  const { open, initialQuery, onClose, onCreated } = props;

  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ✅ Προ-γέμισμα ΜΟΝΟ στο πεδίο Επώνυμο (χωρίς split/υποθέσεις).
  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setSaving(false);
    setFirstName("");
    setLastName(cleanName(initialQuery));
  }, [open, initialQuery]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 12,
          border: "1px solid #333",
          background: "#0f0f0f",
          padding: 14,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <strong>Νέος καλλιτέχνης</strong>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #444",
              background: "transparent",
              borderRadius: 8,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            Κλείσιμο
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, opacity: 0.9 }}>
              Επώνυμο <span style={{ color: "#ffb4b4" }}>*</span>
            </span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="π.χ. ΒΑΜΒΑΚΑΡΗΣ"
              style={{ width: "100%", borderRadius: 8 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, opacity: 0.9 }}>
              Όνομα (προαιρετικό)
            </span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="π.χ. ΜΑΡΚΟΣ"
              style={{ width: "100%", borderRadius: 8 }}
            />
          </label>
        </div>

        {errorMsg ? (
          <div style={{ color: "#ffb4b4", fontSize: 12 }}>{errorMsg}</div>
        ) : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {A.cancel({
            onClick: onClose,
            disabled: saving,
            label: "Άκυρο",
            title: "Άκυρο",
          })}

          {A.save({
            onClick: async () => {
              try {
                setSaving(true);
                setErrorMsg(null);

                const a = await createArtistWithNames({
                  lastName: cleanName(lastName),
                  firstName: cleanName(firstName) || null,
                });

                onCreated(a);
              } catch (e: any) {
                setErrorMsg(
                  String(e?.message ?? "Σφάλμα δημιουργίας καλλιτέχνη"),
                );
              } finally {
                setSaving(false);
              }
            },
            disabled: saving,
            loading: saving,
            label: "Δημιουργία",
            loadingLabel: "Δημιουργία...",
            title: "Δημιουργία",
          })}
        </div>
      </div>
    </div>
  );
}

type PickerProps = {
  selectedIds: number[];
  onChange: (ids: number[]) => void;

  labelById: Map<number, string>;
  setLabelById: React.Dispatch<React.SetStateAction<Map<number, string>>>;
};

function ArtistIdPicker({
  selectedIds,
  onChange,
  labelById,
  setLabelById,
}: PickerProps) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<ArtistOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastReq = useRef(0);

  // ✅ modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createSeed, setCreateSeed] = useState("");

  // debounce search
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setOptions([]);
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    const t = window.setTimeout(async () => {
      const reqId = Date.now();
      lastReq.current = reqId;
      setLoading(true);
      setErrorMsg(null);

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

    return () => window.clearTimeout(t);
  }, [q, setLabelById]);

  function addId(id: number) {
    const next = uniqNums([...(selectedIds ?? []), id]);
    onChange(next);

    setOpen(false);
    setQ("");
    setOptions([]);
    setLoading(false);
    setErrorMsg(null);
  }

  function removeId(id: number) {
    onChange((selectedIds ?? []).filter((x) => x !== id));
  }

  const canOpenCreate =
    q.trim().length > 0 && options.length === 0 && !loading;

  return (
    <div>
      <CreateArtistModal
        open={createOpen}
        initialQuery={createSeed}
        onClose={() => setCreateOpen(false)}
        onCreated={(a) => {
          // store label
          setLabelById((prev) => {
            const next = new Map(prev);
            next.set(a.id, artistDisplay(a));
            return next;
          });

          setCreateOpen(false);
          addId(a.id);
        }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Αναζήτηση καλλιτέχνη"
          style={{
            flex: "0 1 auto",
            width: "100%",
            maxWidth: PICKER_INPUT_MAX_WIDTH,
            borderRadius: 8,
          }}
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
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {options.length === 0 && !loading ? (
            <div style={{ display: "grid", gap: 8, padding: 6 }}>
              <div style={{ opacity: 0.8 }}>Δεν βρέθηκαν αποτελέσματα.</div>

              {/* ✅ ΜΟΝΟ modal - ΟΧΙ direct create */}
             <div
                onPointerDown={(e) => e.preventDefault()} // prevent blur race
                onMouseDown={(e) => e.preventDefault()}
                style={{ width: "100%" }}
              >
                {A.add({
                  onClick: () => {
                    if (!canOpenCreate) return;
                    setErrorMsg(null);
                    setCreateSeed(cleanName(q));
                    setCreateOpen(true);
                    setOpen(false);
                  },
                  disabled: !canOpenCreate,
                  label: "Δημιουργία νέου καλλιτέχνη",
                  title: "Δημιουργία νέου καλλιτέχνη",
                  // Προαιρετικά: iconOnly/showLabel αν θες
                })}
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6, paddingLeft: 4 }}>
                  Θα συμπληρώσεις Επώνυμο/Όνομα.
                </div>
              </div>


              {errorMsg ? (
                <div style={{ color: "#ffb4b4", fontSize: 12 }}>{errorMsg}</div>
              ) : null}
            </div>
          ) : (
            options.map((a) => {
              const isSelected = selectedIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
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
                    fontSize: 13,
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
                padding: CHIP_PADDING,
                opacity: 0.95,
                fontSize: CHIP_FONT_SIZE,
                lineHeight: 1.2,
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
                  fontSize: CHIP_REMOVE_FONT_SIZE,
                  lineHeight: 1,
                  padding: 0,
                }}
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
  const [labelById, setLabelById] = useState<Map<number, string>>(
    () => new Map(),
  );
  // ✅ Responsive breakpoint: κάτω από 720px -> labels πάνω (1 στήλη)
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    function recalc() {
      setIsNarrow(window.innerWidth <= 720);
    }
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  function rowKey(r: DiscographyRow, idx: number) {
    return `${typeof r.id === "number" ? r.id : "new"}-${idx}`;
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
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
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
      <div style={{ marginBottom: 10, opacity: 0.85 }}>
        <strong>Δισκογραφία:</strong> {songTitle}
      </div>

      {rows.length === 0 ? (
        <p style={{ opacity: 0.85, marginTop: 0 }}>Δεν υπάρχουν δισκογραφίες.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r, idx) => {
            const key = rowKey(r, idx);

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

                  <div style={{ marginLeft: "auto" }}>
                    {A.del({
                      onClick: () => removeRow(idx),
                      label: "Αφαίρεση",
                      title: "Αφαίρεση",
                    })}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    alignItems: "start",
                    gridTemplateColumns: isNarrow
                      ? "1fr"
                      : "minmax(140px, 200px) minmax(0, 1fr)",
                  }}
                >
                  <div
                    style={{
                      opacity: 0.9,
                      paddingTop: isNarrow ? 0 : 6,
                    }}
                  >
                    Ερμηνευτές (Front)
                  </div>
                  <ArtistIdPicker
                    selectedIds={r.singerFrontIds}
                    onChange={(ids) => updateRow(idx, { singerFrontIds: ids })}
                    labelById={labelById}
                    setLabelById={setLabelById}
                  />

                  <div
                    style={{
                      opacity: 0.9,
                      paddingTop: isNarrow ? 0 : 6,
                    }}
                  >
                    Ερμηνευτές (Back)
                  </div>
                  <ArtistIdPicker
                    selectedIds={r.singerBackIds}
                    onChange={(ids) => updateRow(idx, { singerBackIds: ids })}
                    labelById={labelById}
                    setLabelById={setLabelById}
                  />

                  <div
                    style={{
                      opacity: 0.9,
                      paddingTop: isNarrow ? 0 : 6,
                    }}
                  >
                    Σολίστες
                  </div>
                  <ArtistIdPicker
                    selectedIds={r.solistIds}
                    onChange={(ids) => updateRow(idx, { solistIds: ids })}
                    labelById={labelById}
                    setLabelById={setLabelById}
                  />

                  <label
                    style={{
                      color: "#fff",
                      paddingTop: isNarrow ? 0 : 6,
                    }}
                  >
                    Έτος
                  </label>
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

      <div
        style={{
          marginTop: 12,
          borderTop: "1px solid #333",
          paddingTop: 12,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        {A.add({
          onClick: addRow,
          label: "Προσθήκη δισκογραφίας",
          title: "Προσθήκη δισκογραφίας",
        })}
      </div>
    </div>
  );
}
