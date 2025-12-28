"use client";

import React, { useMemo, useState } from "react";

export type Option = {
  value: string;
  label: string;
  count?: number; // μπορεί να είναι 0 και πρέπει να εμφανίζεται
};

type SortMode = "auto" | "countDesc" | "labelAsc" | "numericAsc" | "asIs";

type Props = {
  name: string;
  options: Option[];
  selectedValue?: string; // CSV
  onChangeCsv?: (value: string) => void;

  /**
   * ✅ ΝΕΟ:
   * - auto: (default) αν options.length > 5 => count desc, αλλιώς as-is
   * - countDesc: πάντα count desc
   * - labelAsc: πάντα label asc
   * - numericAsc: πάντα numeric asc (με fallback σε label)
   * - asIs: κρατάμε όπως ήρθε
   */
  sortMode?: SortMode;
};

function parseCsv(csv?: string): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toCsv(values: string[]): string {
  return values
    .map((v) => v.trim())
    .filter(Boolean)
    .join(",");
}

function safeCount(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

function compareLabelAsc(a: Option, b: Option): number {
  return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "el");
}

function compareCountDescThenLabel(a: Option, b: Option): number {
  const ca = safeCount(a?.count);
  const cb = safeCount(b?.count);
  if (cb !== ca) return cb - ca;
  return compareLabelAsc(a, b);
}

function compareNumericAscThenLabel(a: Option, b: Option): number {
  const na = Number(String(a?.value ?? "").trim());
  const nb = Number(String(b?.value ?? "").trim());
  const aOk = Number.isFinite(na);
  const bOk = Number.isFinite(nb);

  if (aOk && bOk && na !== nb) return na - nb;

  // fallback (αν κάποια τιμή δεν είναι αριθμός)
  return compareLabelAsc(a, b);
}

export default function FilterSelectWithSearch({
  name,
  options,
  selectedValue,
  onChangeCsv,
  sortMode = "auto",
}: Props) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const selectedSet = useMemo(() => {
    const arr = parseCsv(selectedValue);
    return new Set(arr);
  }, [selectedValue]);

  /**
   * ✅ Βάση options με ελεγχόμενη ταξινόμηση
   */
  const normalizedBaseOptions = useMemo(() => {
    const base = Array.isArray(options) ? options : [];

    // αποφασίζουμε effective sort
    let effective: SortMode = sortMode;

    if (effective === "auto") {
      effective = base.length > 5 ? "countDesc" : "asIs";
    }

    if (effective === "asIs") return base;

    const copy = base.slice();

    if (effective === "countDesc") {
      copy.sort(compareCountDescThenLabel);
      return copy;
    }

    if (effective === "labelAsc") {
      copy.sort(compareLabelAsc);
      return copy;
    }

    if (effective === "numericAsc") {
      copy.sort(compareNumericAscThenLabel);
      return copy;
    }

    // fallback safety
    return copy;
  }, [options, sortMode]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();

    // ✅ "Αρχική" λίστα (χωρίς query): παίρνουμε την normalized βάση
    if (!q) return normalizedBaseOptions;

    // ✅ Με query: φιλτράρουμε πάνω στην normalized βάση
    return normalizedBaseOptions.filter((o) => {
      const label = String(o.label ?? "").toLowerCase();
      return label.includes(q);
    });
  }, [normalizedBaseOptions, query]);

  const visibleOptions = useMemo(() => {
    if (showAll) return filteredOptions;
    return filteredOptions.slice(0, 12);
  }, [filteredOptions, showAll]);

  const toggleValue = (val: string) => {
    const next = new Set(selectedSet);
    if (next.has(val)) next.delete(val);
    else next.add(val);

    const csv = toCsv(Array.from(next));
    onChangeCsv?.(csv);
  };

  const clearAll = () => onChangeCsv?.("");

  const clearQuery = () => setQuery("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      {/* ✅ ώστε το submit του form να έχει πάντα την τιμή */}
      <input type="hidden" name={name} value={selectedValue || ""} />

      {/* ✅ Search input: λευκό με μαύρα γράμματα + "Χ" μέσα στο input */}
      <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Αναζήτηση..."
          style={{
            width: "100%",
            padding: query ? "4px 30px 4px 10px" : "4px 10px", // χώρος για το Χ
            borderRadius: 6,
            border: "1px solid #bbb",
            backgroundColor: "#fff",
            color: "#000",
            height: 36,
            boxSizing: "border-box",
            outline: "none",
          }}
        />

        {query && (
          <button
            type="button"
            onClick={clearQuery}
            aria-label="Καθαρισμός αναζήτησης"
            title="Καθαρισμός αναζήτησης"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              color: "#000",
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
              fontSize: 18,
              fontWeight: 700,
              userSelect: "none",
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* ✅ List */}
      <div
        style={{
          border: "1px solid #3a3a3a", // λίγο πιο λευκό περίγραμμα
          borderRadius: 8,
          padding: 8,
          backgroundColor: "#050505",
          maxHeight: 220,
          overflowY: "auto",
          overflowX: "hidden",
          boxSizing: "border-box",
        }}
      >
        {visibleOptions.length === 0 ? (
          <div style={{ color: "#aaa", fontSize: 12, padding: "6px 4px" }}>
            Δεν βρέθηκαν επιλογές.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visibleOptions.map((opt) => {
              const isChecked = selectedSet.has(opt.value);
              const count = safeCount(opt.count);

              return (
                <label
                  key={`${name}-${opt.value}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#fff",
                    cursor: "pointer",
                    userSelect: "none",
                    minWidth: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleValue(opt.value)}
                    style={{ margin: 0 }}
                  />

                  <span style={{ lineHeight: "16px", minWidth: 0, wordBreak: "break-word" }}>
                    {opt.label} <span style={{ color: "#aaa" }}>({count})</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* ✅ Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={clearAll}
          title="Καθαρισμός επιλογών"
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #555",
            backgroundColor: "#111",
            color: "#fff",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontSize: 12,
          }}
        >
          Καθαρισμός
        </button>

        {filteredOptions.length > 12 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #555",
              backgroundColor: "#111",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {showAll ? "Λιγότερα" : "Περισσότερα..."}
          </button>
        )}
      </div>
    </div>
  );
}
