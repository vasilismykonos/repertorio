"use client";

import React, { useEffect, useMemo, useState } from "react";
import FilterSelectWithSearch, { type Option } from "./FilterSelectWithSearch";

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

  createdByOptions: Option[];

  yearMin: number | null;
  yearMax: number | null;

  chordsCounts: CountMap;
  partitureCounts: CountMap;
  lyricsCounts: CountMap;
  statusCounts: CountMap;

  createdByCounts?: CountMap;

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

type PanelVariant = "modal" | "sidebar";

type FiltersPanelProps = Props & {
  variant: PanelVariant;
  onRequestClose?: () => void;
};

// ---------------- helpers ----------------

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

function firstLabelByValue(opts: Option[], value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const o = (Array.isArray(opts) ? opts : []).find((x) => String(x.value) === v);
  return String(o?.label ?? v).trim();
}

function labelsFromCsv(opts: Option[], csv: string, max = 2): string {
  const ids = (csv || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (ids.length === 0) return "";

  const labels = ids.map((id) => firstLabelByValue(opts, id)).filter(Boolean);
  if (labels.length === 0) return "";

  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} +${labels.length - max}`;
}

function triYesNoSummary(csv: string, yesLabel: string, noLabel: string): string {
  const s = parseCsvToSet(csv);
  const hasYes = s.has("1") || s.has("true");
  const hasNo = s.has("0") || s.has("false");
  if (hasYes && hasNo) return `${yesLabel}, ${noLabel}`;
  if (hasYes) return yesLabel;
  if (hasNo) return noLabel;
  return "";
}

function normalizeYearDraft(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "").slice(0, 4);
}

// ---------------- styles ----------------

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  border: "1px solid #7f7c7c",
  borderRadius: 10,
  padding: 1,
  background: "#0b0b0b",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#fff",
  fontWeight: 700,
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

const summaryBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  maxWidth: 190,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid #4a4a4a",
  background: "#151515",
  color: "#ddd",
  fontSize: 12,
  fontWeight: 500,
};

// ---------------- stable AccordionSection (OUTSIDE FiltersPanel) ----------------

type AccordionSectionProps = {
  sectionKey: string;
  openKey: string | null;
  onToggle: (key: string) => void;
  title: string;
  summary?: string;
  children: React.ReactNode;
};

function AccordionSection({
  sectionKey,
  openKey,
  onToggle,
  title,
  summary,
  children,
}: AccordionSectionProps) {
  const isOpen = openKey === sectionKey;
  const sum = String(summary ?? "").trim();

  return (
    <div style={sectionStyle}>
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        aria-expanded={isOpen}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 5,
          width: "100%",
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 8,
          padding: "5px 5px",
          cursor: "pointer",
          textAlign: "left",
          boxSizing: "border-box",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={labelStyle}>{title}</span>
          {sum ? <span style={summaryBadgeStyle}>{sum}</span> : null}
        </div>

        <span
          aria-hidden="true"
          style={{
            color: "#bbb",
            fontSize: 14,
            lineHeight: 1,
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 120ms ease",
            userSelect: "none",
            flex: "0 0 auto",
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
}

// ---------------- FiltersPanel ----------------

export function FiltersPanel(props: FiltersPanelProps) {
  const {
    variant,
    onRequestClose,

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
    popular, // kept for compatibility
    createdByUserId,

    categoryOptions,
    rythmOptions,
    tagOptions,
    composerOptions,
    lyricistOptions,
    singerFrontOptions,
    singerBackOptions,
    createdByOptions,
    createdByCounts,

    yearMin,
    yearMax,

    chordsCounts,
    partitureCounts,
    lyricsCounts,
    statusCounts,

    onChangeFilters,
  } = props;

  const isModal = variant === "modal";

  // Accordion: ανοίγει μόνο ένα section κάθε φορά
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggleSection = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

  const chordsSet = useMemo(() => parseCsvToSet(chords), [chords]);
  const partitureSet = useMemo(() => parseCsvToSet(partiture), [partiture]);
  const lyricsSet = useMemo(() => parseCsvToSet(lyrics), [lyrics]);
  const statusSet = useMemo(() => parseCsvToSet(status), [status]);

  // Draft years (local typing)
  const [yearFromDraft, setYearFromDraft] = useState<string>(yearFrom || "");
  const [yearToDraft, setYearToDraft] = useState<string>(yearTo || "");

  // Sync drafts όταν αλλάξει externally (π.χ. URL change, clear all, κλπ)
  useEffect(() => setYearFromDraft(yearFrom || ""), [yearFrom]);
  useEffect(() => setYearToDraft(yearTo || ""), [yearTo]);

  // Debounced apply για yearFrom/yearTo:
  // - εφαρμόζει ΜΟΝΟ όταν κενό ή 4 ψηφία
  // - έτσι δεν τρέχεις αναζήτηση σε κάθε πάτημα και δεν χάνεις focus
  useEffect(() => {
    const yf = normalizeYearDraft(yearFromDraft);
    const yt = normalizeYearDraft(yearToDraft);

    const yfReady = yf.length === 0 || yf.length === 4;
    const ytReady = yt.length === 0 || yt.length === 4;

    if (!yfReady && !ytReady) return;

    const desiredYearFrom = yf.length === 4 ? yf : "";
    const desiredYearTo = yt.length === 4 ? yt : "";

    const yearFromSame = String(yearFrom ?? "") === desiredYearFrom;
    const yearToSame = String(yearTo ?? "") === desiredYearTo;

    if (yearFromSame && yearToSame) return;

    const t = window.setTimeout(() => {
      const patch: Parameters<Props["onChangeFilters"]>[0] = {};
      if (!yearFromSame && yfReady) patch.yearFrom = desiredYearFrom;
      if (!yearToSame && ytReady) patch.yearTo = desiredYearTo;
      if (Object.keys(patch).length > 0) onChangeFilters(patch);
    }, 250);

    return () => window.clearTimeout(t);
  }, [yearFromDraft, yearToDraft, yearFrom, yearTo, onChangeFilters]);

  const clearAllFilters = () => {
    onChangeFilters({
      chords: "",
      partiture: "",
      category_id: "",
      rythm_id: "",
      tagIds: "",
      composerIds: "",
      lyricistIds: "",
      singerFrontIds: "",
      singerBackIds: "",
      yearFrom: "",
      yearTo: "",
      lyrics: "",
      status: "",
      popular: "",
      createdByUserId: "",
    });
  };

  // --- summaries ---
  const summaryCategory = labelsFromCsv(categoryOptions, category_id, 2);
  const summaryRythm = labelsFromCsv(rythmOptions, rythm_id, 2);

  const summaryYear =
    String(yearFrom || "").trim() || String(yearTo || "").trim()
      ? `${yearFrom || "…"}–${yearTo || "…"}`
      : "";

  const summaryLyrics = triYesNoSummary(lyrics, "Έχει", "Χωρίς");
  const summaryChords = triYesNoSummary(chords, "Έχει", "Χωρίς");
  const summaryPart = triYesNoSummary(partiture, "Έχει", "Χωρίς");

  const summaryTags = labelsFromCsv(tagOptions, tagIds, 2);
  const summaryComposer = labelsFromCsv(composerOptions, composerIds, 1);
  const summaryLyricist = labelsFromCsv(lyricistOptions, lyricistIds, 1);

  const summarySingersFront = labelsFromCsv(singerFrontOptions, singerFrontIds, 1);
  const summarySingersBack = labelsFromCsv(singerBackOptions, singerBackIds, 1);
  const summarySingers =
    summarySingersFront || summarySingersBack
      ? [
          summarySingersFront && `Front: ${summarySingersFront}`,
          summarySingersBack && `Back: ${summarySingersBack}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  const summaryStatus = (() => {
    const s = statusSet;
    const out: string[] = [];
    if (s.has("PUBLISHED")) out.push("Δημοσιευμένο");
    if (s.has("DRAFT")) out.push("Πρόχειρο");
    return out.join(", ");
  })();

  const summaryCreatedBy = firstLabelByValue(createdByOptions, createdByUserId);

  return (
    <div style={{ width: "100%", boxSizing: "border-box", overflowX: "hidden" }}>
      {isModal && (
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
            <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Φίλτρα αναζήτησης</span>
            <span style={{ fontSize: 12, color: "#aaa", wordBreak: "break-word" }}>
              q: <strong style={{ color: "#fff" }}>{q || "-"}</strong> · take:{" "}
              <strong style={{ color: "#fff" }}>{take}</strong> · skip:{" "}
              <strong style={{ color: "#fff" }}>{skip}</strong>
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
            <button type="button" onClick={clearAllFilters} style={buttonStyle}>
              Καθαρισμός όλων
            </button>
            <button type="button" onClick={onRequestClose} style={buttonStyle}>
              Κλείσιμο
            </button>
          </div>
        </div>
      )}

      {/* ΧΩΡΙΣ form/submit — τα φίλτρα εφαρμόζονται αυτόματα */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <AccordionSection
          sectionKey="category"
          openKey={openKey}
          onToggle={toggleSection}
          title="Κατηγορία"
          summary={summaryCategory}
        >
          <FilterSelectWithSearch
            name="category_id"
            options={categoryOptions}
            selectedValue={category_id}
            onChangeCsv={(v) => onChangeFilters({ category_id: v })}
          />
        </AccordionSection>

        <AccordionSection
          sectionKey="rythm"
          openKey={openKey}
          onToggle={toggleSection}
          title="Ρυθμός"
          summary={summaryRythm}
        >
          <FilterSelectWithSearch
            name="rythm_id"
            options={rythmOptions}
            selectedValue={rythm_id}
            onChangeCsv={(v) => onChangeFilters({ rythm_id: v })}
          />
        </AccordionSection>

        <AccordionSection
          sectionKey="year"
          openKey={openKey}
          onToggle={toggleSection}
          title="Έτος"
          summary={summaryYear}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#bbb" }}>Από</span>
              <input
                type="text"
                inputMode="numeric"
                value={yearFromDraft}
                placeholder={yearMin != null ? String(yearMin) : "π.χ. 1960"}
                onChange={(e) => setYearFromDraft(normalizeYearDraft(e.target.value))}
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
                type="text"
                inputMode="numeric"
                value={yearToDraft}
                placeholder={yearMax != null ? String(yearMax) : "π.χ. 2020"}
                onChange={(e) => setYearToDraft(normalizeYearDraft(e.target.value))}
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

            <span style={{ color: "#777", fontSize: 12, paddingTop: 18 }}>(κενό = χωρίς όριο)</span>
          </div>
        </AccordionSection>

        <AccordionSection
          sectionKey="lyrics"
          openKey={openKey}
          onToggle={toggleSection}
          title="Στίχοι"
          summary={summaryLyrics}
        >
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
        </AccordionSection>

        <AccordionSection
          sectionKey="chords"
          openKey={openKey}
          onToggle={toggleSection}
          title="Συγχορδίες"
          summary={summaryChords}
        >
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
        </AccordionSection>

        <AccordionSection
          sectionKey="partiture"
          openKey={openKey}
          onToggle={toggleSection}
          title="Παρτιτούρες"
          summary={summaryPart}
        >
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
        </AccordionSection>

        <AccordionSection sectionKey="tags" openKey={openKey} onToggle={toggleSection} title="Tags" summary={summaryTags}>
          <FilterSelectWithSearch
            name="tagIds"
            options={tagOptions}
            selectedValue={tagIds}
            onChangeCsv={(v) => onChangeFilters({ tagIds: v })}
          />
        </AccordionSection>

        <AccordionSection
          sectionKey="composer"
          openKey={openKey}
          onToggle={toggleSection}
          title="Συνθέτης"
          summary={summaryComposer}
        >
          <FilterSelectWithSearch
            name="composerIds"
            options={composerOptions}
            selectedValue={composerIds}
            onChangeCsv={(v) => onChangeFilters({ composerIds: v })}
          />
        </AccordionSection>

        <AccordionSection
          sectionKey="lyricist"
          openKey={openKey}
          onToggle={toggleSection}
          title="Στιχουργός"
          summary={summaryLyricist}
        >
          <FilterSelectWithSearch
            name="lyricistIds"
            options={lyricistOptions}
            selectedValue={lyricistIds}
            onChangeCsv={(v) => onChangeFilters({ lyricistIds: v })}
          />
        </AccordionSection>

        <AccordionSection
          sectionKey="singers"
          openKey={openKey}
          onToggle={toggleSection}
          title="Ερμηνευτές"
          summary={summarySingers}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 6 }}>Ερμηνευτής (Front)</div>
              <FilterSelectWithSearch
                name="singerFrontIds"
                options={singerFrontOptions}
                selectedValue={singerFrontIds}
                onChangeCsv={(v) => onChangeFilters({ singerFrontIds: v })}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 6 }}>Ερμηνευτής (Back)</div>
              <FilterSelectWithSearch
                name="singerBackIds"
                options={singerBackOptions}
                selectedValue={singerBackIds}
                onChangeCsv={(v) => onChangeFilters({ singerBackIds: v })}
              />
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          sectionKey="status"
          openKey={openKey}
          onToggle={toggleSection}
          title="Κατάσταση"
          summary={summaryStatus}
        >
          {[
            { key: "PUBLISHED", label: "Δημοσιευμένο" },
            { key: "DRAFT", label: "Πρόχειρο" },
          ].map((s) => (
            <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
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
        </AccordionSection>

        <AccordionSection
          sectionKey="createdBy"
          openKey={openKey}
          onToggle={toggleSection}
          title="Δημιουργός"
          summary={summaryCreatedBy}
        >
          <FilterSelectWithSearch
            name="createdByUserId"
            options={createdByOptions}
            selectedValue={createdByUserId}
            onChangeCsv={(v) => onChangeFilters({ createdByUserId: v })}
            sortMode="labelAsc"
          />

          {!!createdByCounts && (
            <div style={{ color: "#888", fontSize: 12 }}>
              (σύνολο creators: {Object.keys(createdByCounts).length})
            </div>
          )}
        </AccordionSection>
      </div>
    </div>
  );
}

// ---------------- FiltersModal wrapper ----------------

export default function FiltersModal(props: Props) {
  const [open, setOpen] = useState(false);

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
            <FiltersPanel {...props} variant="modal" onRequestClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
