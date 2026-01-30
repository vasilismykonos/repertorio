"use client";

/**
 * Common tonicity utilities and UI components.
 *
 * This module centralises all note‐selection logic into a single file so
 * you can update the available tones or change their presentation from
 * one place. Import the `TonicityPills` component when you need an
 * interactive set of pill buttons, or use the exported constants and
 * helpers elsewhere in the app.
 */

import React, { useMemo } from "react";

/**
 * Natural (no sharps) Greek note names. The order here determines the
 * visual ordering of the pill buttons.
 */
const NATURAL = ["Ντο", "Ρε", "Μι", "Φα", "Σολ", "Λα", "Σι"] as const;

/**
 * Sharp note names. Empty strings act as placeholders where there is no
 * corresponding sharp (e.g. between Μι and Φα). When constructing the
 * union type we filter these out.
 */
const SHARP = ["Ντο#", "Ρε#", "", "Φα#", "Σολ#", "Λα#", ""] as const;

export type TonicityValue =
  | (typeof NATURAL)[number]
  | Exclude<(typeof SHARP)[number], "">;

export const TONICITY_VALUES: TonicityValue[] = [
  ...NATURAL,
  ...SHARP.filter(Boolean),
] as TonicityValue[];

export const TONICITY_OPTIONS: Array<{ value: TonicityValue }> =
  TONICITY_VALUES.map((v) => ({ value: v }));

export function normalizeTonicity(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.endsWith("-") ? s.slice(0, -1) : s;
}

export function displayTonicityLabel(base: string, withMinus: boolean): string {
  return withMinus ? `${base}-` : base;
}

export function isValidTonicity(v: string): v is TonicityValue {
  return TONICITY_VALUES.includes(v as TonicityValue);
}

export type TonicityPillsProps = {
  value: string | null | undefined;
  onChange: (v: TonicityValue) => void;
  disabled?: boolean;
  withMinus?: boolean;
  showNaturals?: boolean;
  showSharps?: boolean;
  className?: string;
};

export function TonicityPills(props: TonicityPillsProps) {
  const {
    value,
    onChange,
    disabled,
    withMinus = true,
    showNaturals = true,
    showSharps = true,
    className,
  } = props;

  const picked = useMemo(() => {
    const v = normalizeTonicity(value);
    return isValidTonicity(v) ? v : "";
  }, [value]);

  const naturals = showNaturals ? (NATURAL as readonly TonicityValue[]) : [];
  const sharps = showSharps
    ? (SHARP.filter(Boolean) as Array<Exclude<(typeof SHARP)[number], "">>)
    : [];

  // ✅ SAME style as your quick chips in SongsSearchClient
  const baseStyle: React.CSSProperties = {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 16,
    border: "1px solid #666",
    backgroundColor: "#111",
    color: "#fff",
    fontSize: "0.9rem",
    fontWeight: 800,
    whiteSpace: "nowrap",
    lineHeight: 1.1,
    cursor: disabled ? "default" : "pointer",
    userSelect: "none",
    WebkitAppearance: "none",
    appearance: "none",
    transition: "transform 120ms ease, filter 120ms ease",
    opacity: disabled ? 0.6 : 1,
  };

  const selectedStyle: React.CSSProperties = {
  border: "2px solid #ff4747",
  backgroundColor: "#ff4747",
  color: "#fff",
};


  return (
    <div className={className}>
      <div className="tp-row">
        {naturals.map((ton) => {
          const selected = picked === ton;
          return (
            <button
              key={ton}
              type="button"
              disabled={!!disabled}
              onClick={() => onChange(ton)}
              title={`Επιλογή: ${ton}`}
              style={{ ...baseStyle, ...(selected ? selectedStyle : null) }}
            >
              {displayTonicityLabel(ton, withMinus)}
            </button>
          );
        })}
      </div>

      {sharps.length ? (
        <div className="tp-row">
          {sharps.map((ton) => {
            const selected = picked === ton;
            return (
              <button
                key={ton}
                type="button"
                disabled={!!disabled}
                onClick={() => onChange(ton as TonicityValue)}
                title={`Επιλογή: ${ton}`}
                style={{ ...baseStyle, ...(selected ? selectedStyle : null) }}
              >
                {displayTonicityLabel(ton, withMinus)}
              </button>
            );
          })}
        </div>
      ) : null}

      <style jsx>{`
        .tp-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px; /* ίδιο “feel” με τα chips */
          margin-bottom: 8px;
        }
        button:hover {
          filter: brightness(1.08);
        }
        button:active {
          transform: translateY(1px);
        }
        button:disabled:hover {
          filter: none;
        }
        button:disabled:active {
          transform: none;
        }
      `}</style>
    </div>
  );
}

export default TonicityPills;
/**
 * Parse/normalize tonicity from user content (SingerTunes etc).
 * Accepts Greek (Ντο, Ρε#, ...) or Latin (A-G with optional #/b).
 * Returns a valid Greek tonicity label (e.g. "Λα#", "Ρε") or null.
 */
export function parseTonicity(input: unknown): TonicityValue | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  // 1) Greek roots
  const gr = raw.match(/(Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)/i);
  if (gr) {
    const t = gr[1].trim().toLowerCase();
    const map: Record<string, TonicityValue> = {
      ντο: "Ντο",
      "ντο#": "Ντο#",
      ρε: "Ρε",
      "ρε#": "Ρε#",
      μι: "Μι",
      φα: "Φα",
      "φα#": "Φα#",
      σολ: "Σολ",
      "σολ#": "Σολ#",
      λα: "Λα",
      "λα#": "Λα#",
      σι: "Σι",
    };
    return map[t] ?? null;
  }

  // 2) Latin roots (A-G, with optional #/b)
  const en = raw.match(/([A-G])\s*(#|b)?/i);
  if (!en) return null;

  const letter = en[1].toUpperCase();
  const accidental = (en[2] || "").toLowerCase();

  const base: TonicityValue | null =
    letter === "A"
      ? "Λα"
      : letter === "B"
        ? "Σι"
        : letter === "C"
          ? "Ντο"
          : letter === "D"
            ? "Ρε"
            : letter === "E"
              ? "Μι"
              : letter === "F"
                ? "Φα"
                : letter === "G"
                  ? "Σολ"
                  : null;

  if (!base) return null;

  // UI policy: only #; treat b as natural (no enharmonics)
  if (accidental === "#") {
    const sharp = (`${base}#` as unknown) as string;
    return isValidTonicity(sharp) ? (sharp as TonicityValue) : null;
  }
  return base;
}
