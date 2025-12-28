"use client";

import React, { useEffect, useMemo, useState } from "react";
import FilterSelectWithSearch, { Option } from "./FilterSelectWithSearch";

type CountMap = Record<string, number>;

type Props = {
  q: string;
  take: number;
  skip: number;

  chords: string;
  partiture: string;
  category_id: string;
  rythm_id: string;

  tagIds: string;

  composerIds: string;
  lyricistIds: string;

  singerFrontIds: string;
  singerBackIds: string;

  yearFrom: string;
  yearTo: string;

  lyrics: string;
  status: string;
  popular: string;
  createdByUserId: string;

  categoryOptions: Option[];
  rythmOptions: Option[];
  tagOptions: Option[];
  composerOptions: Option[];
  lyricistOptions: Option[];

  singerFrontOptions: Option[];
  singerBackOptions: Option[];

  yearMin: number | null;
  yearMax: number | null;

  chordsCounts: CountMap;
  partitureCounts: CountMap;
  lyricsCounts: CountMap;
  statusCounts: CountMap;

  onChangeFilters: (patch: {
    chords?: string;
    partiture?: string;
    category_id?: string;
    rythm_id?: string;
    tagIds?: string;

    composerIds?: string;
    lyricistIds?: string;

    singerFrontIds?: string;
    singerBackIds?: string;

    yearFrom?: string;
    yearTo?: string;

    lyrics?: string;
    status?: string;
    popular?: string;
    createdByUserId?: string;
  }) => void;
};

function parseCsvToSet(value: string): Set<string> {
  const s = new Set<string>();
  const raw = String(value ?? "").trim();
  if (!raw) return s;
  for (const p of raw.split(",")) {
    const t = p.trim();
    if (t) s.add(t);
  }
  return s;
}

function toCsvFromSet(set: Set<string>): string {
  return Array.from(set.values()).join(",");
}

function toggleInSet(set: Set<string>, value: string) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  border: "1px solid #2f2f2f",
  borderRadius: 10,
  padding: 12,
  background: "#0b0b0b",
  boxSizing: "border-box",
  overflowX: "hidden",
};

const labelStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#fff",
  fontWeight: 700,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 10,
  flexWrap: "wrap",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #333",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  boxSizing: "border-box",
};

export default function FiltersModal({
  q,
  take,
  skip,
  chords,
  partiture,
  category_id,
  rythm_id,
  tagIds,
  composerIds,
  lyricistIds,
  singerFrontIds,
  singerBackIds,
  yearFrom,
  yearTo,
  lyrics,
  status,
  // popular παραμένει prop (δεν το αλλάζουμε εδώ πλέον)
  createdByUserId,
  categoryOptions,
  rythmOptions,
  tagOptions,
  composerOptions,
  lyricistOptions,
  singerFrontOptions,
  singerBackOptions,
  yearMin,
  yearMax,
  chordsCounts,
  partitureCounts,
  lyricsCounts,
  statusCounts,
  onChangeFilters,
}: Props) {
  const [open, setOpen] = useState(false);

  // ✅ Collapsible state per section (χωρίς sort)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    category: true,
    rythm: true,
    year: true,
    lyrics: true,
    chords: true,
    partiture: true,
    tags: true,
    composer: true,
    lyricist: true,
    singers: true,
    status: true,
    createdBy: true,
  });

  const toggleSection = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const chordsSet = useMemo(() => parseCsvToSet(chords), [chords]);
  const partitureSet = useMemo(() => parseCsvToSet(partiture), [partiture]);
  const lyricsSet = useMemo(() => parseCsvToSet(lyrics), [lyrics]);
  const statusSet = useMemo(() => parseCsvToSet(status), [status]);

  // ✅ Lock scroll + hard stop σε οριζόντιο overflow όσο είναι open
  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverflowX = html.style.overflowX;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverflowX = body.style.overflowX;

    html.style.overflow = "hidden";
    html.style.overflowX = "hidden";
    body.style.overflow = "hidden";
    body.style.overflowX = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);

      html.style.overflow = prevHtmlOverflow;
      html.style.overflowX = prevHtmlOverflowX;
      body.style.overflow = prevBodyOverflow;
      body.style.overflowX = prevBodyOverflowX;
    };
  }, [open]);

  const Section = ({
    sectionKey,
    title,
    children,
  }: {
    sectionKey: string;
    title: string;
    children: React.ReactNode;
  }) => {
    const isOpen = expanded[sectionKey] !== false;

    return (
      <div style={sectionStyle}>
        <button
          type="button"
          onClick={() => toggleSection(sectionKey)}
          aria-expanded={isOpen}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            width: "100%",
            background: "#121212",
            border: "1px solid #333",
            borderRadius: 8,
            padding: "8px 10px",
            cursor: "pointer",
            textAlign: "left",
            boxSizing: "border-box",
          }}
        >
          <span style={labelStyle}>{title}</span>
          <span
            aria-hidden="true"
            style={{
              color: "#bbb",
              fontSize: 14,
              lineHeight: 1,
              transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 120ms ease",
              userSelect: "none",
            }}
          >
            ▾
          </span>
        </button>

        {isOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const fd = new FormData(form);

    const getSingle = (key: string) => {
      const v = fd.get(key);
      if (v == null) return "";
      return String(v).trim();
    };

    const patch: Parameters<Props["onChangeFilters"]>[0] = {};

    patch.category_id = getSingle("category_id");
    patch.rythm_id = getSingle("rythm_id");

    patch.tagIds = getSingle("tagIds");

    patch.composerIds = getSingle("composerIds");
    patch.lyricistIds = getSingle("lyricistIds");

    patch.singerFrontIds = getSingle("singerFrontIds");
    patch.singerBackIds = getSingle("singerBackIds");

    patch.yearFrom = getSingle("yearFrom");
    patch.yearTo = getSingle("yearTo");

    patch.createdByUserId = getSingle("createdByUserId");

    // ✅ ΣΗΜΑΝΤΙΚΟ: ΔΕΝ κάνουμε submit popular από το modal πλέον.
    // Το popular/ταξινόμηση ελέγχεται από το dropdown δίπλα στο κουμπί "Φίλτρα".

    onChangeFilters(patch);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          ...buttonStyle,
          borderColor: "#444",
          background: "#151515",
          height: 38,
        }}
      >
        Φίλτρα
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 50,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: 12,
            boxSizing: "border-box",
            overflowY: "auto",
            overflowX: "hidden",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: "min(350px, 100%)",
              maxWidth: 350,
              boxSizing: "border-box",
              background: "#050505",
              border: "1px solid #3a3a3a",
              borderRadius: 14,
              padding: 12,
              marginTop: 24,
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
              overflowX: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                  Φίλτρα αναζήτησης
                </span>
                <span style={{ fontSize: 12, color: "#aaa", wordBreak: "break-word" }}>
                  q: <strong style={{ color: "#fff" }}>{q || "-"}</strong> · take:{" "}
                  <strong style={{ color: "#fff" }}>{take}</strong> · skip:{" "}
                  <strong style={{ color: "#fff" }}>{skip}</strong>
                </span>
              </div>

              <button type="button" onClick={() => setOpen(false)} style={buttonStyle}>
                Κλείσιμο
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minWidth: 0,
              }}
            >
              {/* 1) Κατηγορία */}
              <Section sectionKey="category" title="Κατηγορία">
                <FilterSelectWithSearch
                  name="category_id"
                  options={categoryOptions}
                  selectedValue={category_id}
                  onChangeCsv={(v) => onChangeFilters({ category_id: v })}
                />
              </Section>

              {/* 2) Ρυθμός */}
              <Section sectionKey="rythm" title="Ρυθμός">
                <FilterSelectWithSearch
                  name="rythm_id"
                  options={rythmOptions}
                  selectedValue={rythm_id}
                  onChangeCsv={(v) => onChangeFilters({ rythm_id: v })}
                />
              </Section>

              {/* 3) Έτος */}
              <Section sectionKey="year" title="Έτος">
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#bbb" }}>Από</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      name="yearFrom"
                      value={yearFrom}
                      placeholder={yearMin != null ? String(yearMin) : "π.χ. 1960"}
                      onChange={(e) => onChangeFilters({ yearFrom: e.target.value })}
                      style={{
                        width: 120,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid #bbb",
                        background: "#fff",
                        color: "#000",
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </label>

                  <span style={{ color: "#888", fontSize: 12, paddingTop: 18 }}>→</span>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#bbb" }}>Έως</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      name="yearTo"
                      value={yearTo}
                      placeholder={yearMax != null ? String(yearMax) : "π.χ. 2020"}
                      onChange={(e) => onChangeFilters({ yearTo: e.target.value })}
                      style={{
                        width: 120,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid #bbb",
                        background: "#fff",
                        color: "#000",
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                  </label>

                  <span style={{ color: "#777", fontSize: 12, paddingTop: 18 }}>
                    (κενό = χωρίς όριο)
                  </span>
                </div>
              </Section>

              {/* 4) Στίχοι */}
              <Section sectionKey="lyrics" title="Στίχοι">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
                  <input
                    type="checkbox"
                    checked={lyricsSet.has("1")}
                    onChange={() => {
                      const next = new Set(lyricsSet);
                      toggleInSet(next, "1");
                      onChangeFilters({ lyrics: toCsvFromSet(next) });
                    }}
                  />
                  Έχει στίχους <span style={{ color: "#888" }}>({lyricsCounts["1"] ?? 0})</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
                  <input
                    type="checkbox"
                    checked={lyricsSet.has("0")}
                    onChange={() => {
                      const next = new Set(lyricsSet);
                      toggleInSet(next, "0");
                      onChangeFilters({ lyrics: toCsvFromSet(next) });
                    }}
                  />
                  Χωρίς στίχους <span style={{ color: "#888" }}>({lyricsCounts["0"] ?? 0})</span>
                </label>
              </Section>

              {/* 5) Συγχορδίες */}
              <Section sectionKey="chords" title="Συγχορδίες">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
                  <input
                    type="checkbox"
                    checked={chordsSet.has("1")}
                    onChange={() => {
                      const next = new Set(chordsSet);
                      toggleInSet(next, "1");
                      onChangeFilters({ chords: toCsvFromSet(next) });
                    }}
                  />
                  Έχει συγχορδίες <span style={{ color: "#888" }}>({chordsCounts["1"] ?? 0})</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
                  <input
                    type="checkbox"
                    checked={chordsSet.has("0")}
                    onChange={() => {
                      const next = new Set(chordsSet);
                      toggleInSet(next, "0");
                      onChangeFilters({ chords: toCsvFromSet(next) });
                    }}
                  />
                  Χωρίς συγχορδίες <span style={{ color: "#888" }}>({chordsCounts["0"] ?? 0})</span>
                </label>
              </Section>

              {/* 6) Παρτιτούρες */}
              <Section sectionKey="partiture" title="Παρτιτούρες">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
                  <input
                    type="checkbox"
                    checked={partitureSet.has("1")}
                    onChange={() => {
                      const next = new Set(partitureSet);
                      toggleInSet(next, "1");
                      onChangeFilters({ partiture: toCsvFromSet(next) });
                    }}
                  />
                  Έχει παρτιτούρα <span style={{ color: "#888" }}>({partitureCounts["1"] ?? 0})</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
                  <input
                    type="checkbox"
                    checked={partitureSet.has("0")}
                    onChange={() => {
                      const next = new Set(partitureSet);
                      toggleInSet(next, "0");
                      onChangeFilters({ partiture: toCsvFromSet(next) });
                    }}
                  />
                  Χωρίς παρτιτούρα <span style={{ color: "#888" }}>({partitureCounts["0"] ?? 0})</span>
                </label>
              </Section>

              {/* 7) Tags */}
              <Section sectionKey="tags" title="Tags">
                <FilterSelectWithSearch
                  name="tagIds"
                  options={tagOptions}
                  selectedValue={tagIds}
                  onChangeCsv={(v) => onChangeFilters({ tagIds: v })}
                />
              </Section>

              {/* 8) Συνθέτης */}
              <Section sectionKey="composer" title="Συνθέτης">
                <FilterSelectWithSearch
                  name="composerIds"
                  options={composerOptions}
                  selectedValue={composerIds}
                  onChangeCsv={(v) => onChangeFilters({ composerIds: v })}
                />
              </Section>

              {/* 9) Στιχουργός */}
              <Section sectionKey="lyricist" title="Στιχουργός">
                <FilterSelectWithSearch
                  name="lyricistIds"
                  options={lyricistOptions}
                  selectedValue={lyricistIds}
                  onChangeCsv={(v) => onChangeFilters({ lyricistIds: v })}
                />
              </Section>

              {/* 10) Ερμηνευτές */}
              <Section sectionKey="singers" title="Ερμηνευτές">
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#bbb", marginBottom: 6 }}>
                      Ερμηνευτής (Front)
                    </div>
                    <FilterSelectWithSearch
                      name="singerFrontIds"
                      options={singerFrontOptions}
                      selectedValue={singerFrontIds}
                      onChangeCsv={(v) => onChangeFilters({ singerFrontIds: v })}
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#bbb", marginBottom: 6 }}>
                      Ερμηνευτής (Back)
                    </div>
                    <FilterSelectWithSearch
                      name="singerBackIds"
                      options={singerBackOptions}
                      selectedValue={singerBackIds}
                      onChangeCsv={(v) => onChangeFilters({ singerBackIds: v })}
                    />
                  </div>
                </div>
              </Section>

              {/* 11) Κατάσταση */}
              <Section sectionKey="status" title="Κατάσταση">
                {[
                  { key: "PUBLISHED", label: "Δημοσιευμένο" },
                  { key: "DRAFT", label: "Πρόχειρο" },
                ].map((s) => (
                  <label
                    key={s.key}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}
                  >
                    <input
                      type="checkbox"
                      checked={statusSet.has(s.key)}
                      onChange={() => {
                        const next = new Set(statusSet);
                        toggleInSet(next, s.key);
                        onChangeFilters({ status: toCsvFromSet(next) });
                      }}
                    />
                    {s.label} <span style={{ color: "#888" }}>({statusCounts[s.key] ?? 0})</span>
                  </label>
                ))}
              </Section>

              {/* 12) Δημιουργός */}
              <Section sectionKey="createdBy" title="Δημιουργός (User ID)">
                <input
                  type="text"
                  name="createdByUserId"
                  defaultValue={createdByUserId}
                  placeholder="π.χ. 123"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#000",
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </Section>

              <div style={actionsStyle}>
                <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
                  Άκυρο
                </button>
                <button
                  type="submit"
                  style={{ ...buttonStyle, borderColor: "#555", background: "#141414" }}
                >
                  Εφαρμογή
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
