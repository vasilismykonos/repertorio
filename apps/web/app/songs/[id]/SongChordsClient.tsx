"use client";

import { useEffect, useMemo, useState } from "react";

type SongChordsClientProps = {
  chords: string;
  originalKey?: string | null;
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

const NATURAL_TONICITIES = ["Ντο", "Ρε", "Μι", "Φα", "Σολ", "Λα", "Σι"];
const SHARP_TONICITIES = ["Ντο#", "Ρε#", "", "Φα#", "Σολ#", "Λα#", ""];

// Map για index → συγχορδία
const CHORD_INDEX_MAP: Record<string, number> = ALL_CHORDS.reduce(
  (acc, chord, index) => {
    acc[chord] = index;
    return acc;
  },
  {} as Record<string, number>
);

const CHORD_INDEX_MAP_SMALL: Record<string, number> =
  ALL_CHORDS_SMALL.reduce((acc, chord, index) => {
    acc[chord] = index;
    return acc;
  }, {} as Record<string, number>);

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

// Ανάλυση πεδίου originalKey σε (βάση, πρόσημο)
function parseOriginalKey(
  originalKey?: string | null
): { baseChord: string | null; sign: "+" | "-" } {
  if (!originalKey) {
    return { baseChord: null, sign: "+" };
  }

  const trimmed = originalKey.trim();
  if (!trimmed) {
    return { baseChord: null, sign: "+" };
  }

  // Παράδειγμα τιμών: "Λα-", "Λα -", "Ρε +", "Σολ+"
  const regex =
    /(Ντο#?|Ρε#?|Μι|Φα#?|Φα|Σολ#?|Σολ|Λα#?|Λα|Σι)\s*([+\-])?/i;
  const match = trimmed.match(regex);

  if (!match) {
    return { baseChord: null, sign: "+" };
  }

  const chordRaw = match[1] || "";
  const norm = normalizeGreekChordName(chordRaw);
  const signChar = match[2] === "-" ? "-" : "+";

  return { baseChord: norm, sign: signChar };
}

// Εξαγωγή τελευταίας συγχορδίας + πρόσημο (+/-) από το κείμενο
function detectLastChordAndSign(chords: string): {
  baseChord: string | null;
  sign: "+" | "-";
} {
  if (!chords) {
    return { baseChord: null, sign: "+" };
  }

  const regexChord =
    /([Νν][το]|[Ρρ][ε]|[Μμ][ι]|[Φφ][α]|[Σσ][ολ]|[Λλ][α]|[Σσ][ι])(#?)[\+\-]?/g;
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;

  while ((match = regexChord.exec(chords)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    return { baseChord: null, sign: "+" };
  }

  const full = lastMatch[0];
  let sign: "+" | "-" = "+";
  if (full.includes("-")) {
    sign = "-";
  }

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

  if (!base) {
    return { baseChord: null, sign };
  }

  if (sharp === "#") {
    base += "#";
  }

  return { baseChord: base, sign };
}

// Transport συγχορδιών όπως στο PHP transportChords
function transportChords(
  originalChord: string,
  targetChord: string,
  chordsContent: string
): string {
  const originalIndex =
    CHORD_INDEX_MAP[originalChord] ?? CHORD_INDEX_MAP_SMALL[originalChord];
  const targetIndex =
    CHORD_INDEX_MAP[targetChord] ?? CHORD_INDEX_MAP_SMALL[targetChord];

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

  const placeholders = ALL_CHORDS.map(
    (_chord, index) => `__CHORD_${index}__`
  );
  const placeholdersSmall = ALL_CHORDS_SMALL.map(
    (_chord, index) => `__chord_${index}__`
  );

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
    const baseIndex =
      CHORD_INDEX_MAP[chord.charAt(0).toUpperCase() + chord.slice(1)];
    if (baseIndex === undefined) return;
    const newIndex = (baseIndex + offset + 12) % 12;
    const newChord = ALL_CHORDS_SMALL[newIndex];
    result = result.split(placeholder).join(newChord);
  });

  return result;
}

// Χρωματισμός συγχορδιών (SpTune, Tunes_small, Stigmata, Numbers κτλ.)
function colorizeChords(chords: string): string {
  if (!chords) return "";

  let result = chords;

  // Ενδεικτικό – εδώ θα μπει η πλήρης λογική σου όταν τη μεταφέρεις
  result = result.replace(
    /(\[[^\]]+\])/g,
    '<span class="SpTune">$1</span>'
  );

  return result;
}

export default function SongChordsClient({
  chords,
  originalKey,
}: SongChordsClientProps) {
  const [baseChord, setBaseChord] = useState<string | null>(null);
  const [lastSign, setLastSign] = useState<"+" | "-">("+");
  const [selectedTonicity, setSelectedTonicity] = useState<string | null>(null);

  // Εντοπισμός βάσης & πρόσημου:
  // 1) Προτεραιότητα στο originalKey (γενική τονικότητα τραγουδιού)
  // 2) Fallback στην τελευταία συγχορδία από το κείμενο
  useEffect(() => {
    // 1. Από originalKey, αν υπάρχει και είναι αναγνώσιμη
    if (originalKey && originalKey.trim() !== "") {
      const { baseChord: fromOrig, sign: signFromOrig } =
        parseOriginalKey(originalKey);

      if (fromOrig) {
        setBaseChord(fromOrig);
        setLastSign(signFromOrig);
        setSelectedTonicity(fromOrig);
        return;
      }
    }

    // 2. Fallback: ανίχνευση από το κείμενο συγχορδιών
    const { baseChord: autoBase, sign: autoSign } =
      detectLastChordAndSign(chords);

    setBaseChord(autoBase);
    setLastSign(autoSign);
    setSelectedTonicity(autoBase);
  }, [chords, originalKey]);

  // ΚΟΙΝΗ ΤΟΝΙΚΟΤΗΤΑ (για Room): κρατάμε global μεταβλητή
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    w.__repSelectedTonicity = selectedTonicity || null;
  }, [selectedTonicity]);

  // Εφαρμογή pending τονικότητας που ήρθε από το Room
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    const pending =
      (w.__repPendingSelectedTonicity as string | null | undefined) || null;
    if (!pending) return;

    let attempts = 0;
    const maxAttempts = 20; // ~5 δευτερόλεπτα
    const interval = 250; // ms

    const tryApply = () => {
      const ton =
        (w.__repPendingSelectedTonicity as string | null | undefined) ||
        pending;
      if (!ton) return;

      const btn = document.querySelector<HTMLButtonElement>(
        '.tonicity-button[data-tonicity="' + ton + '"]'
      );

      if (btn) {
        btn.click();
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryApply, interval);
      } else {
        w.__repPendingSelectedTonicity = null;
      }
    };

    tryApply();
  }, []);

  const renderedChordsHtml = useMemo(() => {
    if (!chords || chords.trim() === "") return "";

    if (!baseChord || !selectedTonicity) {
      return colorizeChords(chords);
    }

    const transported = transportChords(baseChord, selectedTonicity, chords);
    return colorizeChords(transported);
  }, [chords, baseChord, selectedTonicity]);

  return (
    <section
      id="chords"
      data-base-tonicity={baseChord || ""}
      data-base-sign={lastSign}
      className="song-chords-container"
      style={{ marginBottom: 24 }}
    >
      {/* Κουμπιά Τονικοτήτων */}
      {baseChord && (
        <div
          className="tonicities-wrapper"
          style={{ marginTop: 8, marginBottom: 8 }}
        >
          <div className="tonicities-row">
            {NATURAL_TONICITIES.map((ton) => {
              const selected = selectedTonicity === ton;
              const label = `${ton}${lastSign}`;
              return (
                <button
                  key={ton}
                  type="button"
                  className={
                    "tonicity-button" + (selected ? " selected" : "")
                  }
                  data-tonicity={ton}
                  onClick={() => setSelectedTonicity(ton)}
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
              const label = `${ton}${lastSign}`;
              return (
                <button
                  key={ton}
                  type="button"
                  className={
                    "tonicity-button" + (selected ? " selected" : "")
                  }
                  data-tonicity={ton}
                  onClick={() => setSelectedTonicity(ton)}
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

      {/* Τοπικό styling για το component */}
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
        .Tunes_small {
          color: #ffe7a9;
        }
        .Stigmata {
          color: #cccccc;
        }
        .Numbers {
          color: #66d9ef;
          font-weight: bold;
        }
      `}</style>
    </section>
  );
}
