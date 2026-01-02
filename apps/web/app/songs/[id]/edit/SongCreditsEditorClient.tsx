"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ArtistOption = {
  id: number;
  title: string;
  firstName?: string | null;
  lastName?: string | null;
};

type SelectedArtist = { id: number; label: string };

type Props = {
  // truth from /songs/:id/credits
  initialComposerArtistIds: number[];
  initialLyricistArtistIds: number[];

  // fallback from legacy song.composerName/song.lyricistName
  initialComposerNames?: string[];
  initialLyricistNames?: string[];

  // IMPORTANT: name of the hidden input to be submitted
  hiddenInputName: string; // e.g. "creditsJson"
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

function cleanName(s: any): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function uniqNums(arr: any[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const x of arr ?? []) {
    const n = Math.trunc(Number(x));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function uniqStrings(arr: any[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr ?? []) {
    const t = cleanName(x);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function artistDisplay(a: ArtistOption): string {
  const full = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  const name = (full || a.title || "").trim();
  return name || "Καλλιτέχνης";
}

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

      const seen = new Set<number>();
      const out: ArtistOption[] = [];

      for (const x of arr) {
        const id = Number(x?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const a: ArtistOption = {
          id: Math.trunc(id),
          title: String(x?.title ?? "").trim(),
          firstName: x?.firstName ?? null,
          lastName: x?.lastName ?? null,
        };
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
    // ✅ ΠΛΕΟΝ ΣΤΕΛΝΟΥΜΕ ΡΗΤΑ firstName/lastName (όχι title από free-text)
    body: JSON.stringify({ firstName, lastName }),
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

async function resolveNameToArtist(name: string): Promise<SelectedArtist | null> {
  const target = cleanName(name);
  if (!target) return null;

  const results = await fetchArtistsSearch(target, 10);
  const targetKey = target.toLowerCase();

  for (const a of results) {
    const label = artistDisplay(a);
    if (cleanName(label).toLowerCase() === targetKey) {
      return { id: a.id, label };
    }
  }
  return null;
}

function buildCreditsPayload(composers: SelectedArtist[], lyricists: SelectedArtist[]) {
  const composerArtistIds = uniqNums(composers.map((x) => x.id));
  const lyricistArtistIds = uniqNums(lyricists.map((x) => x.id));
  const composerNames = uniqStrings(composers.map((x) => x.label));
  const lyricistNames = uniqStrings(lyricists.map((x) => x.label));

  return { composerArtistIds, lyricistArtistIds, composerNames, lyricistNames };
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

  // ✅ Προ-γέμισμα ΜΟΝΟ στο πεδίο Επώνυμο για να υποχρεώσεις τον χρήστη να το επιβεβαιώσει/διορθώσει.
  // Δεν κάνουμε split και δεν υποθέτουμε τίποτα.
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
        // click outside -> close
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
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
            <span style={{ fontSize: 13, opacity: 0.9 }}>Όνομα (προαιρετικό)</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="π.χ. ΜΑΡΚΟΣ"
              style={{ width: "100%", borderRadius: 8 }}
            />
          </label>
        </div>

        {errorMsg ? <div style={{ color: "#ffb4b4", fontSize: 12 }}>{errorMsg}</div> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              border: "1px solid #444",
              background: "transparent",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            Άκυρο
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true);
                setErrorMsg(null);
                const a = await createArtistWithNames({
                  lastName: cleanName(lastName),
                  firstName: cleanName(firstName) || null,
                });
                onCreated(a);
              } catch (e: any) {
                setErrorMsg(String(e?.message ?? "Σφάλμα δημιουργίας καλλιτέχνη"));
              } finally {
                setSaving(false);
              }
            }}
            style={{
              border: "1px solid #555",
              background: "transparent",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
              fontWeight: 700,
            }}
            title="Δημιουργία"
          >
            Δημιουργία
          </button>
        </div>
      </div>
    </div>
  );
}

function ArtistPicker({
  selected,
  onChange,
}: {
  selected: SelectedArtist[];
  onChange: (next: SelectedArtist[]) => void;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<ArtistOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSeed, setCreateSeed] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastReq = useRef(0);

  const selectedIdSet = useMemo(() => new Set(selected.map((x) => x.id)), [selected]);

  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setOptions([]);
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    const t = setTimeout(async () => {
      const reqId = Date.now();
      lastReq.current = reqId;
      setLoading(true);
      setErrorMsg(null);

      const res = await fetchArtistsSearch(text, 20);
      if (lastReq.current !== reqId) return;

      setOptions(res);
      setLoading(false);
    }, 250);

    return () => clearTimeout(t);
  }, [q]);

  function addArtist(a: ArtistOption) {
    if (selectedIdSet.has(a.id)) return;
    const next = [...selected, { id: a.id, label: artistDisplay(a) }];
    onChange(next);

    setOpen(false);
    setQ("");
    setOptions([]);
    setLoading(false);
    setErrorMsg(null);
  }

  function removeArtist(id: number) {
    onChange(selected.filter((x) => x.id !== id));
  }

  const canOpenCreate = q.trim().length > 0 && options.length === 0 && !loading;

  return (
    <div>
      <CreateArtistModal
        open={createOpen}
        initialQuery={createSeed}
        onClose={() => setCreateOpen(false)}
        onCreated={(a) => {
          setCreateOpen(false);
          addArtist(a);
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
          style={{ flex: "0 1 auto", width: "100%", maxWidth: 360, borderRadius: 8 }}
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

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!canOpenCreate) return;
                  setErrorMsg(null);
                  setCreateSeed(cleanName(q));
                  setCreateOpen(true);
                }}
                disabled={!canOpenCreate}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #555",
                  background: "transparent",
                  cursor: canOpenCreate ? "pointer" : "default",
                  fontSize: 13,
                  opacity: canOpenCreate ? 1 : 0.7,
                }}
                title="Άνοιγμα φόρμας δημιουργίας καλλιτέχνη"
              >
                <strong>+ Δημιουργία νέου καλλιτέχνη</strong>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                  Θα σου ζητηθεί Επώνυμο/Όνομα (ώστε να μη γίνει λάθος σειρά).
                </div>
              </button>

              {errorMsg ? (
                <div style={{ color: "#ffb4b4", fontSize: 12 }}>{errorMsg}</div>
              ) : null}
            </div>
          ) : (
            options.map((a) => {
              const label = artistDisplay(a);
              const isSelected = selectedIdSet.has(a.id);

              return (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!isSelected) addArtist(a);
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
                    opacity: isSelected ? 0.75 : 1,
                  }}
                  title={isSelected ? "Ήδη επιλεγμένος" : "Προσθήκη"}
                >
                  <strong>{label}</strong>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {selected.length === 0 ? (
          <small style={{ opacity: 0.75 }}>Κανένας επιλεγμένος.</small>
        ) : (
          selected.map((x) => (
            <span
              key={x.id}
              style={{
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                border: "1px solid #444",
                borderRadius: 999,
                padding: "1px 8px",
                opacity: 0.95,
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              <span>{cleanName(x.label) || `#${x.id}`}</span>
              <button
                type="button"
                onClick={() => removeArtist(x.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  opacity: 0.8,
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
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

export default function SongCreditsEditorClient({
  initialComposerArtistIds,
  initialLyricistArtistIds,
  initialComposerNames,
  initialLyricistNames,
  hiddenInputName,
}: Props) {
  const [composers, setComposers] = useState<SelectedArtist[]>([]);
  const [lyricists, setLyricists] = useState<SelectedArtist[]>([]);

  // init from IDs; fallback resolve from names if IDs empty
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const compIds = uniqNums(initialComposerArtistIds ?? []);
      const lyrIds = uniqNums(initialLyricistArtistIds ?? []);

      const comp: SelectedArtist[] = [];
      const lyr: SelectedArtist[] = [];

      for (const id of compIds) {
        const a = await fetchArtistById(id);
        comp.push(a ? { id: a.id, label: artistDisplay(a) } : { id, label: `#${id}` });
      }

      for (const id of lyrIds) {
        const a = await fetchArtistById(id);
        lyr.push(a ? { id: a.id, label: artistDisplay(a) } : { id, label: `#${id}` });
      }

      if (comp.length === 0 && Array.isArray(initialComposerNames) && initialComposerNames.length) {
        for (const name of uniqStrings(initialComposerNames)) {
          const r = await resolveNameToArtist(name);
          if (r) comp.push(r);
        }
      }

      if (lyr.length === 0 && Array.isArray(initialLyricistNames) && initialLyricistNames.length) {
        for (const name of uniqStrings(initialLyricistNames)) {
          const r = await resolveNameToArtist(name);
          if (r) lyr.push(r);
        }
      }

      if (cancelled) return;
      setComposers(comp);
      setLyricists(lyr);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payload = useMemo(() => buildCreditsPayload(composers, lyricists), [composers, lyricists]);
  const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 12,
        padding: 12,
        background: "#0f0f0f",
        display: "grid",
        gap: 14,
      }}
    >
      {/* ✅ THE ONLY SOURCE OF TRUTH FOR SUBMIT */}
      <input type="hidden" name={hiddenInputName} value={payloadJson} readOnly />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Συνθέτες</div>
          <ArtistPicker selected={composers} onChange={setComposers} />
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Στιχουργοί</div>
          <ArtistPicker selected={lyricists} onChange={setLyricists} />
        </div>
      </div>
    </div>
  );
}
