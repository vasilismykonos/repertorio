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

const CHORD_INDEX_MAP_SMALL: Record<string, number> = ALL_CHORDS_SMALL.reduce(
  (acc, chord, index) => {
    acc[chord] = index;
    return acc;
  },
  {} as Record<string, number>
);

// Εντοπισμός τελευταίας συγχορδίας και πρόσημου, όπως στο PHP regex
function detectLastChordAndSign(text: string): {
  baseChord: string | null;
  sign: "+" | "-";
} {
  const regex =
    /(Ντο|Ρε|Μι|Φα|Σολ|Λα|Σι)([#♯b♭]?)([+\-]?)/g;
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;

  while ((match = regex.exec(text)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    return { baseChord: null, sign: "+" };
  }

  const base = lastMatch[1] + (lastMatch[2] || "");
  let sign: "+" | "-" = "+";
  if (lastMatch[3] === "-") sign = "-";
  if (lastMatch[3] === "+") sign = "+";

  return { baseChord: base, sign };
}

// Transport συγχορδιών όπως στο PHP transportChords
function transportChords(
  originalChord: string,
  targetChord: string,
  chordsContent: string
): string {
  const originalIndex =
    CHORD_INDEX_MAP[originalChord] ??
    CHORD_INDEX_MAP_SMALL[originalChord];
  const targetIndex =
    CHORD_INDEX_MAP[targetChord] ??
    CHORD_INDEX_MAP_SMALL[targetChord];

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

  // Δημιουργία placeholders (ώστε να μη γίνουν διπλές αντικαταστάσεις)
  const placeholders = ALL_CHORDS.map(
    (_chord, index) => `__CHORD_${index}__`
  );
  const placeholdersSmall = ALL_CHORDS_SMALL.map(
    (_chord, index) => `__chord_${index}__`
  );

  // 1. Αντικατάσταση πρώτα των # (κεφαλαίων)
  ALL_CHORDS.forEach((chord, index) => {
    if (chord.includes("#")) {
      const placeholder = placeholders[index];
      result = result.split(chord).join(placeholder);
    }
  });

  // 2. Αντικατάσταση πρώτα των # (πεζών)
  ALL_CHORDS_SMALL.forEach((chord, index) => {
    if (chord.includes("#")) {
      const placeholder = placeholdersSmall[index];
      result = result.split(chord).join(placeholder);
    }
  });

  // 3. Αντικατάσταση των φυσικών (χωρίς #) κεφαλαίων
  ALL_CHORDS.forEach((chord, index) => {
    if (!chord.includes("#")) {
      const placeholder = placeholders[index];
      result = result.split(chord).join(placeholder);
    }
  });

  // 4. Αντικατάσταση των φυσικών (χωρίς #) πεζών
  ALL_CHORDS_SMALL.forEach((chord, index) => {
    if (!chord.includes("#")) {
      const placeholder = placeholdersSmall[index];
      result = result.split(chord).join(placeholder);
    }
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
    const baseIndex = CHORD_INDEX_MAP_SMALL[chord];
    if (baseIndex === undefined) return;
    const newIndex = (baseIndex + offset + 12) % 12;
    const newChord = ALL_CHORDS_SMALL[newIndex];
    result = result.split(placeholder).join(newChord);
  });

  return result;
}

// Χρωματισμός συγχορδιών (Tunes, Tunes_small, Stigmata, Numbers) όπως στο PHP
function colorizeChords(input: string): string {
  let out = input;

  const categories: { className: string; tokens: string[] }[] = [
    {
      className: "Tunes",
      tokens: [
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
      ],
    },
    {
      className: "Tunes_small",
      tokens: [
        "ντο",
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
      ],
    },
    {
      className: "Stigmata",
      tokens: ["(", ")", "{", "}", "+", "-", "*", "#"],
    },
    {
      className: "Numbers",
      tokens: ["1", "2", "3", "4", "5", "6", "7", "8"],
    },
  ];

  const escapeRegex = (s: string) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  categories.forEach(({ className, tokens }) => {
    tokens.forEach((token) => {
      if (!token) return;
      const re = new RegExp(escapeRegex(token), "g");
      out = out.replace(
        re,
        `<span class="${className}">${token}</span>`
      );
    });
  });

  return out;
}

export default function SongChordsClient({
  chords,
  originalKey,
}: SongChordsClientProps) {
  const [baseChord, setBaseChord] = useState<string | null>(null);
  const [lastSign, setLastSign] = useState<"+" | "-">("+");
  const [selectedTonicity, setSelectedTonicity] = useState<string | null>(
    null
  );

  // Εντοπισμός τελευταίας συγχορδίας + πρόσημο όταν φορτώνει / αλλάζει το κείμενο
  useEffect(() => {
    const { baseChord, sign } = detectLastChordAndSign(chords);
    setBaseChord(baseChord);
    setLastSign(sign);
    setSelectedTonicity(baseChord); // default: ίδια τονικότητα με την τελευταία συγχορδία
  }, [chords]);

  const renderedChordsHtml = useMemo(() => {
    if (!chords || chords.trim() === "") return "";

    // Αν δεν βρέθηκε έγκυρη συγχορδία, γύρνα απλά χρωματισμένο το αρχικό
    if (!baseChord || !selectedTonicity) {
      return colorizeChords(chords);
    }

    const transported = transportChords(
      baseChord,
      selectedTonicity,
      chords
    );
    return colorizeChords(transported);
  }, [chords, baseChord, selectedTonicity]);

  return (
    <section
      id="chords-section"
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
                    "tonicity-button" +
                    (selected ? " selected" : "")
                  }
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
                    "tonicity-button" +
                    (selected ? " selected" : "")
                  }
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
      `}</style>

      {/* Global styling για τις κλάσεις που μπαίνουν μέσα στο HTML (dangerouslySetInnerHTML) */}
      <style jsx global>{`
        .Tunes {
          color: #ffd479;
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
