"use client";

import { useEffect, useMemo, useState } from "react";
// Bring in tonicity definitions and helpers from the central index module.
// We rely solely on the exported values from `index.tsx` to drive the UI for
// tonicity selection. This avoids duplicating note arrays here and keeps
// everything consistent across the application.
import {
  TONICITY_VALUES,
  isValidTonicity,
} from "@/app/components/tonicity/index";

type SongChordsClientProps = {
  chords: string | null;
  originalKey?: string | null; // π.χ. "103"
  originalKeySign?: "+" | "-" | null;
};


// Πίνακες συγχορδιών όπως στο PHP
const ALL_CHORDS = [
  "Ντο",
  "Ντο#",
  "Ρε",
  "Ρε#",
  "Μι",
  "Φα",
  "Φα#",
  "Σολ",
  "Σολ#",
  "Λα",
  "Λα#",
  "Σι",
];
const ALL_CHORDS_SMALL = [
  "ντο",
  "ντο#",
  "ρε",
  "ρε#",
  "μι",
  "φα",
  "φα#",
  "σολ",
  "σολ#",
  "λα",
  "λα#",
  "σι",
];

// Derive the natural and sharp tonicity lists from the central TONICITY_VALUES.
// `TONICITY_VALUES` is ordered with all natural notes first and then sharps.
// We filter on the presence of a "#" to split them into two groups. This
// ensures that the UI uses the same source of truth as the rest of the app.
const NATURAL_TONICITIES: string[] = TONICITY_VALUES.filter((v) => !v.includes("#"));
const SHARP_TONICITIES: string[] = TONICITY_VALUES.filter((v) => v.includes("#"));

// Map για index → συγχορδία
const CHORD_INDEX_MAP: Record<string, number> = ALL_CHORDS.reduce((acc, chord, index) => {
  acc[chord] = index;
  return acc;
}, {} as Record<string, number>);

const CHORD_INDEX_MAP_SMALL: Record<string, number> = ALL_CHORDS_SMALL.reduce((acc, chord, index) => {
  acc[chord] = index;
  return acc;
}, {} as Record<string, number>);
function originalKeyCodeStringToBaseChord(codeStr: string | null | undefined): string | null {
  const s = (codeStr ?? "").toString().trim();
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  const code = Math.trunc(n);
  const idx = code - 101; // 101=Ντο ... 112=Σι
  if (idx < 0 || idx >= ALL_CHORDS.length) return null;

  return ALL_CHORDS[idx] ?? null;
}

// Normalization helper για ελληνικά ονόματα συγχορδιών
function normalizeGreekChordName(name: string): string | null {
  const t = name.trim().toLowerCase();

  switch (t) {
    case "ντο":
      return "Ντο";
    case "ντο#":
      return "Ντο#";
    case "ρε":
      return "Ρε";
    case "ρε#":
      return "Ρε#";
    case "μι":
      return "Μι";
    case "φα":
      return "Φα";
    case "φα#":
      return "Φα#";
    case "σολ":
      return "Σολ";
    case "σολ#":
      return "Σολ#";
    case "λα":
      return "Λα";
    case "λα#":
      return "Λα#";
    case "σι":
      return "Σι";
    default:
      return null;
  }
}

/**
 * Δέχεται input όπως:
 * - "Λα", "λα", "Λα+", "Λα -", "λα#", "Ρε#", κλπ
 * Επιστρέφει base τονικότητα (π.χ. "Λα", "Ρε#") ή null.
 */
function normalizeTonicityInput(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  const match = raw.match(/(Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)/i);
  if (!match) return null;

  return normalizeGreekChordName(match[1] ?? "");
}



// Εξαγωγή τελευταίας συγχορδίας + πρόσημο (+/-) από το κείμενο
function detectLastChordAndSign(chords: string | null): { baseChord: string | null; sign: "+" | "-" | null } {
  const text = chords ?? "";
  if (!text) return { baseChord: null, sign: null };

  const regexChord = /([Νν][το]|[Ρρ][ε]|[Μμ][ι]|[Φφ][α]|[Σσ][ολ]|[Λλ][α]|[Σσ][ι])(#?)[\+\-]?/g;
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;

  while ((match = regexChord.exec(text)) !== null) lastMatch = match;

  if (!lastMatch) return { baseChord: null, sign: null };

  const full = lastMatch[0];
  const sign: "+" | "-" | null = full.includes("-") ? "-" : full.includes("+") ? "+" : null;


  const tonic = (lastMatch[1] || "").toLowerCase();
  const sharp = lastMatch[2] || "";

  let base: string | null = null;
  switch (tonic) {
    case "ντο":
      base = "Ντο";
      break;
    case "ρε":
      base = "Ρε";
      break;
    case "μι":
      base = "Μι";
      break;
    case "φα":
      base = "Φα";
      break;
    case "σολ":
      base = "Σολ";
      break;
    case "λα":
      base = "Λα";
      break;
    case "σι":
      base = "Σι";
      break;
    default:
      base = null;
  }

  if (!base) return { baseChord: null, sign: null };

  if (sharp === "#") base += "#";
  return { baseChord: base, sign };
}

// Transport συγχορδιών όπως στο PHP transportChords
function transportChords(originalChord: string, targetChord: string, chordsContent: string): string {
  const originalIndex = CHORD_INDEX_MAP[originalChord] ?? CHORD_INDEX_MAP_SMALL[originalChord];
  const targetIndex = CHORD_INDEX_MAP[targetChord] ?? CHORD_INDEX_MAP_SMALL[targetChord];

  if (
    originalIndex === undefined ||
    targetIndex === undefined ||
    Number.isNaN(originalIndex) ||
    Number.isNaN(targetIndex)
  ) {
    return chordsContent;
  }

  const offset = targetIndex - originalIndex;
  let result = chordsContent;

  const placeholders = ALL_CHORDS.map((_chord, index) => `__CHORD_${index}__`);
  const placeholdersSmall = ALL_CHORDS_SMALL.map((_chord, index) => `__chord_${index}__`);

  // 1. Αντικατάσταση πρώτα των # (κεφαλαίων)
  ALL_CHORDS.forEach((chord, index) => {
    const placeholder = placeholders[index];
    const escaped = chord.replace("#", "\\#");
    const regex = new RegExp(escaped + "(?![A-Za-zΑ-Ωα-ω0-9])", "g");
    result = result.replace(regex, placeholder);
  });

  // 2. Αντικατάσταση απλών (κεφαλαίων)
  ALL_CHORDS.forEach((chord, index) => {
    const placeholder = placeholders[index];
    const escaped = chord.replace("#", "\\#");
    const regex = new RegExp(escaped, "g");
    result = result.replace(regex, placeholder);
  });

  // 3. Μικρά με # (για να ταιριάζουν σε πεζά)
  ALL_CHORDS_SMALL.forEach((chord, index) => {
    const placeholder = placeholdersSmall[index];
    const escaped = chord.replace("#", "\\#");
    const regex = new RegExp(escaped + "(?![A-Za-zΑ-Ωα-ω0-9])", "g");
    result = result.replace(regex, placeholder);
  });

  // 4. Μικρά χωρίς #
  ALL_CHORDS_SMALL.forEach((chord, index) => {
    const placeholder = placeholdersSmall[index];
    const escaped = chord.replace("#", "\\#");
    const regex = new RegExp(escaped, "g");
    result = result.replace(regex, placeholder);
  });

  // 5. Τελική αντικατάσταση placeholders με νέες συγχορδίες (κεφαλαία)
  ALL_CHORDS.forEach((chord, index) => {
    const placeholder = placeholders[index];
    const baseIndex = CHORD_INDEX_MAP[chord];
    if (baseIndex === undefined) return;
    const newIndex = (baseIndex + offset + 12) % 12;
    const newChord = ALL_CHORDS[newIndex];
    result = result.split(placeholder).join(newChord);
  });

  // 6. Τελική αντικατάσταση placeholders με νέες συγχορδίες (πεζά)
  ALL_CHORDS_SMALL.forEach((chord, index) => {
    const placeholder = placeholdersSmall[index];
    const cap = chord.charAt(0).toUpperCase() + chord.slice(1);
    const baseIndex = CHORD_INDEX_MAP[cap];
    if (baseIndex === undefined) return;
    const newIndex = (baseIndex + offset + 12) % 12;
    const newChord = ALL_CHORDS_SMALL[newIndex];
    result = result.split(placeholder).join(newChord);
  });

  return result;
}

// Χρωματισμός συγχορδιών
function colorizeChords(chords: string): string {
  if (!chords) return "";
  let result = chords;
  result = result.replace(/(\[[^\]]+\])/g, '<span class="SpTune">$1</span>');
  return result;
}

function dispatchTonicityChanged(detail: { tonicity: string | null; sign: "+" | "-" | null }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rep:tonicityChanged", { detail }));
}


export default function SongChordsClient({ chords, originalKey, originalKeySign }: SongChordsClientProps) {

  const [baseChord, setBaseChord] = useState<string | null>(null);
  const [lastSign, setLastSign] = useState<"+" | "-" | null>(null);
  const [selectedTonicity, setSelectedTonicity] = useState<string | null>(null);

  // ✅ 1) Κεντρική συνάρτηση εφαρμογής τονικότητας
  function applySelectedTonicity(input: unknown) {
    const norm = normalizeTonicityInput(input);
    if (!norm) return;

    // δέχεται μόνο tonicity values που γνωρίζει η εφαρμογή.  Χρησιμοποιούμε
    // την helper `isValidTonicity` από το index για να ελέγξουμε αν το
    // normalized input ανήκει στο καθορισμένο σύνολο TONICITY_VALUES. Αν δεν
    // είναι έγκυρο, δεν θα ενημερώσουμε την επιλογή.
    if (!isValidTonicity(norm)) return;

    setSelectedTonicity(norm);

    if (typeof window !== "undefined") {
      (window as any).__repSelectedTonicity = norm;
    }

    dispatchTonicityChanged({ tonicity: norm, sign: lastSign });

  }

  // Init: βάση + πρόσημο + default selected (και ενημέρωση global + event)
  useEffect(() => {
  let initBase: string | null = null;
  let initSign: "+" | "-" | null = null;

  const fromDbBase = originalKeyCodeStringToBaseChord(originalKey);
  const fromDbSign =
    originalKeySign === "+" || originalKeySign === "-" ? originalKeySign : null;

  if (fromDbBase) {
    initBase = fromDbBase;
    initSign = fromDbSign; // μπορεί να είναι null
  }

  if (!initBase || initSign == null) {
    const { baseChord: autoBase, sign: autoSign } = detectLastChordAndSign(chords ?? "");

    if (!initBase) initBase = autoBase;

    // πάρε sign από chords μόνο αν βρέθηκε chord + δεν είχες sign
    if (initSign == null && autoBase && (autoSign === "+" || autoSign === "-")) {
      initSign = autoSign;
    }
  }

  setBaseChord(initBase);
  setLastSign(initSign);

  if (initBase) {
    setSelectedTonicity(initBase);
    if (typeof window !== "undefined") (window as any).__repSelectedTonicity = initBase;

    // αν initSign είναι null, στείλε "+" μόνο στο event αν το χρειάζεσαι,
    // αλλιώς άλλαξε και το event να δέχεται null.
   dispatchTonicityChanged({ tonicity: initBase, sign: initSign });
  } else {
    setSelectedTonicity(null);
    if (typeof window !== "undefined") (window as any).__repSelectedTonicity = null;
    dispatchTonicityChanged({ tonicity: null, sign: initSign });

  }
}, [chords, originalKey, originalKeySign]);



  // Expose setter για άλλα components (SingerTunes, Rooms, κτλ.)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const w = window as any;

    w.__repSetSelectedTonicity = (tonicity: unknown) => {
      applySelectedTonicity(tonicity);
    };

    return () => {
      try {
        delete w.__repSetSelectedTonicity;
      } catch {
        w.__repSetSelectedTonicity = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSign]);

  const renderedChordsHtml = useMemo(() => {
    if (!chords || chords.trim() === "") return "";
    if (!baseChord || !selectedTonicity) return colorizeChords(chords);

    const transported = transportChords(baseChord, selectedTonicity, chords);
    return colorizeChords(transported);
  }, [chords, baseChord, selectedTonicity]);

  return (
    <section
      id="chords"
      data-base-tonicity={baseChord || ""}
      data-base-sign={lastSign ?? ""}
      className="song-chords-container"
      style={{ marginBottom: 24 }}
    >
      {/* Κουμπιά Τονικοτήτων */}
      {baseChord && (
        <div className="tonicities-wrapper" style={{ marginTop: 8, marginBottom: 8 }}>
          <div className="tonicities-row">
            {NATURAL_TONICITIES.map((ton) => {
              const selected = selectedTonicity === ton;
              const label = `${ton}${lastSign ?? ""}`;
              return (
                <button
                  key={ton}
                  type="button"
                  className={"tonicity-button" + (selected ? " selected" : "")}
                  data-tonicity={ton}
                  onClick={() => applySelectedTonicity(ton)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="tonicities-row">
            {SHARP_TONICITIES.map((ton) => {
              if (!ton) return null;
              const selected = selectedTonicity === ton;
              const label = `${ton}${lastSign ?? ""}`;
              return (
                <button
                  key={ton}
                  type="button"
                  className={"tonicity-button" + (selected ? " selected" : "")}
                  data-tonicity={ton}
                  onClick={() => applySelectedTonicity(ton)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Μπλοκ συγχορδιών */}
      <div
        id="chords-block"
        className="chords-block"
        style={{
          whiteSpace: "pre-wrap",
          backgroundColor: "#111",
          padding: "16px",
          borderRadius: 8,
          border: "1px solid #333",
          lineHeight: 1.6,
          fontFamily: "monospace",
          fontSize: "0.95rem",
        }}
        dangerouslySetInnerHTML={{ __html: renderedChordsHtml }}
      />

      <style jsx>{`
        .tonicities-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 4px;
        }
        .tonicity-button {
          background: #222;
          color: #fff;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: 0.2s;
        }
        .tonicity-button:hover {
          background: #444;
        }
        .tonicity-button.selected {
          background: #ff4747 !important;
          border-color: #ff4747 !important;
          color: #fff !important;
          font-weight: bold;
        }

        .SpTune {
          color: #ffd700;
          font-weight: bold;
        }
      `}</style>
    </section>
  );
}
