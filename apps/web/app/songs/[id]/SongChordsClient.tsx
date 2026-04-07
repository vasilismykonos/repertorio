"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TONICITY_VALUES,
  isValidTonicity,
} from "@/app/components/tonicity/index";

type SongChordsClientProps = {
  chords: string | null;
  originalKey?: string | null; // π.χ. "103"
  originalKeySign?: "+" | "-" | null;
};

const CHORDS = [
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
] as const;

const CHORDS_SMALL = CHORDS.map((c) => c.toLowerCase()) as string[];

const NATURAL_TONICITIES = TONICITY_VALUES.filter((v) => !v.includes("#"));
const SHARP_TONICITIES = TONICITY_VALUES.filter((v) => v.includes("#"));

const CHORD_INDEX_MAP: Record<string, number> = Object.fromEntries(
  CHORDS.map((chord, index) => [chord, index])
);

const CHORD_INDEX_MAP_SMALL: Record<string, number> = Object.fromEntries(
  CHORDS_SMALL.map((chord, index) => [chord, index])
);

const CHORDS_SCALE_STORAGE_KEY = "repertorio_chords_scale_v1";
const CHORDS_BASE_FONT_SIZE = 14;
const CHORDS_SCALE_MIN = 0.75;
const CHORDS_SCALE_MAX = 2.2;

const NOTE_TOKEN_REGEX =
  /(Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι|ντο#?|ρε#?|μι|φα#?|σολ#?|λα#?|σι)/g;

function clampScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(CHORDS_SCALE_MAX, Math.max(CHORDS_SCALE_MIN, value));
}

function distance2(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function originalKeyCodeStringToBaseChord(codeStr: string | null | undefined): string | null {
  const s = (codeStr ?? "").trim();
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  const code = Math.trunc(n);
  const idx = code - 101; // 101=Ντο ... 112=Σι

  if (idx < 0 || idx >= CHORDS.length) return null;
  return CHORDS[idx] ?? null;
}

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

function normalizeTonicityInput(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const raw = input.trim();
  if (!raw) return null;

  const match = raw.match(/(Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)/i);
  if (!match) return null;

  return normalizeGreekChordName(match[1] ?? "");
}

function detectLastChordAndSign(
  chords: string | null
): { baseChord: string | null; sign: "+" | "-" | null } {
  const text = chords ?? "";
  if (!text) return { baseChord: null, sign: null };

  const regex = /((Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)|(ντο#?|ρε#?|μι|φα#?|σολ#?|λα#?|σι))([+-]?)/g;

  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;

  while ((match = regex.exec(text)) !== null) {
    last = match;
  }

  if (!last) return { baseChord: null, sign: null };

  const chordToken = last[1] ?? "";
  const signToken = last[4] ?? "";

  const normalized = normalizeGreekChordName(chordToken);
  if (!normalized) return { baseChord: null, sign: null };

  const sign: "+" | "-" | null =
    signToken === "+" ? "+" : signToken === "-" ? "-" : null;

  return { baseChord: normalized, sign };
}

function transposeChordToken(token: string, offset: number): string {
  const isLower = token === token.toLowerCase();
  const index = isLower ? CHORD_INDEX_MAP_SMALL[token] : CHORD_INDEX_MAP[token];

  if (index === undefined) return token;

  const nextIndex = (index + offset + 12) % 12;
  return isLower ? CHORDS_SMALL[nextIndex] : CHORDS[nextIndex];
}

function transportChords(originalChord: string, targetChord: string, chordsContent: string): string {
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

  return chordsContent.replace(NOTE_TOKEN_REGEX, (token) => {
    return transposeChordToken(token, offset);
  });
}

function colorizeChords(chords: string): string {
  if (!chords) return "";
  return chords.replace(/(\[[^\]]+\])/g, '<span class="SpTune">$1</span>');
}

function dispatchTonicityChanged(detail: {
  tonicity: string | null;
  sign: "+" | "-" | null;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rep:tonicityChanged", { detail }));
}

export default function SongChordsClient({
  chords,
  originalKey,
  originalKeySign,
}: SongChordsClientProps) {
  const chordsBlockRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ dist0: number; scale0: number; active: boolean } | null>(null);

  const [baseChord, setBaseChord] = useState<string | null>(null);
  const [lastSign, setLastSign] = useState<"+" | "-" | null>(null);
  const [selectedTonicity, setSelectedTonicity] = useState<string | null>(null);
  const [chordsScale, setChordsScale] = useState(1);

  function applySelectedTonicity(input: unknown) {
    const normalized = normalizeTonicityInput(input);
    if (!normalized) return;
    if (!isValidTonicity(normalized)) return;

    setSelectedTonicity(normalized);

    if (typeof window !== "undefined") {
      (window as any).__repSelectedTonicity = normalized;
    }

    dispatchTonicityChanged({
      tonicity: normalized,
      sign: lastSign,
    });
  }

  useEffect(() => {
    let initBase: string | null = null;
    let initSign: "+" | "-" | null = null;

    const fromDbBase = originalKeyCodeStringToBaseChord(originalKey);
    const fromDbSign =
      originalKeySign === "+" || originalKeySign === "-" ? originalKeySign : null;

    if (fromDbBase) {
      initBase = fromDbBase;
      initSign = fromDbSign;
    }

    if (!initBase || initSign == null) {
      const auto = detectLastChordAndSign(chords);

      if (!initBase) initBase = auto.baseChord;
      if (initSign == null && auto.sign) initSign = auto.sign;
    }

    setBaseChord(initBase);
    setLastSign(initSign);

    if (typeof window !== "undefined") {
      (window as any).__repSelectedTonicity = initBase;
    }

    setSelectedTonicity(initBase);

    dispatchTonicityChanged({
      tonicity: initBase,
      sign: initSign,
    });
  }, [chords, originalKey, originalKeySign]);

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
  }, [lastSign]);

  const renderedChordsHtml = useMemo(() => {
    if (!chords || chords.trim() === "") return "";
    if (!baseChord || !selectedTonicity) return colorizeChords(chords);

    const transported = transportChords(baseChord, selectedTonicity, chords);
    return colorizeChords(transported);
  }, [chords, baseChord, selectedTonicity]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(CHORDS_SCALE_STORAGE_KEY);
      if (!raw) return;

      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        setChordsScale(clampScale(n));
      }
    } catch {}
  }, []);

  function persistChordsScale(next: number) {
    try {
      window.localStorage.setItem(CHORDS_SCALE_STORAGE_KEY, String(next));
    } catch {}
  }

  function applyChordsScale(next: number) {
    const clamped = clampScale(next);
    setChordsScale(clamped);
    persistChordsScale(clamped);
  }

  useEffect(() => {
    const el = chordsBlockRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;

      e.preventDefault();

      const step = 0.08;
      const direction = e.deltaY > 0 ? -1 : 1;

      setChordsScale((prev) => {
        const next = clampScale(prev + direction * step);
        persistChordsScale(next);
        return next;
      });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as EventListener);
  }, []);

  useEffect(() => {
    const el = chordsBlockRef.current;
    if (!el) return;

    function onTouchStartNative(e: TouchEvent) {
      if (e.touches.length !== 2) return;

      const d0 = distance2(e.touches[0], e.touches[1]);
      pinchRef.current = {
        dist0: d0,
        scale0: chordsScale,
        active: true,
      };

      e.preventDefault();
    }

    function onTouchMoveNative(e: TouchEvent) {
      const p = pinchRef.current;
      if (!p?.active || e.touches.length !== 2) return;

      e.preventDefault();

      const d1 = distance2(e.touches[0], e.touches[1]);
      if (p.dist0 <= 0) return;

      const factor = d1 / p.dist0;
      const next = clampScale(p.scale0 * factor);
      setChordsScale(next);
    }

    function onTouchEndNative() {
      const p = pinchRef.current;
      if (!p?.active) return;

      pinchRef.current = null;

      setChordsScale((prev) => {
        persistChordsScale(prev);
        return prev;
      });
    }

    function onGesture(e: Event) {
      e.preventDefault();
    }

    el.addEventListener("touchstart", onTouchStartNative, { passive: false });
    el.addEventListener("touchmove", onTouchMoveNative, { passive: false });
    el.addEventListener("touchend", onTouchEndNative, { passive: true });
    el.addEventListener("touchcancel", onTouchEndNative, { passive: true });

    el.addEventListener("gesturestart", onGesture as EventListener, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gesturechange", onGesture as EventListener, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gestureend", onGesture as EventListener, { passive: false } as AddEventListenerOptions);

    return () => {
      el.removeEventListener("touchstart", onTouchStartNative as EventListener);
      el.removeEventListener("touchmove", onTouchMoveNative as EventListener);
      el.removeEventListener("touchend", onTouchEndNative as EventListener);
      el.removeEventListener("touchcancel", onTouchEndNative as EventListener);
      el.removeEventListener("gesturestart", onGesture as EventListener);
      el.removeEventListener("gesturechange", onGesture as EventListener);
      el.removeEventListener("gestureend", onGesture as EventListener);
    };
  }, [chordsScale]);

  function chordsZoomIn() {
    applyChordsScale(chordsScale + 0.12);
  }

  function chordsZoomOut() {
    applyChordsScale(chordsScale - 0.12);
  }

  function chordsZoomReset() {
    applyChordsScale(1);
  }

  return (
    <section
      id="chords"
      data-base-tonicity={baseChord || ""}
      data-base-sign={lastSign ?? ""}
      className="song-chords-container"
      style={{ marginBottom: 0 }}
    >
      {baseChord && (
        <div className="tonicities-wrapper" style={{ marginTop: 4, marginBottom: 4 }}>
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginTop: 2,
          marginBottom: 2,
          flexWrap: "wrap",
        }}
      />

      <div
        id="chords-block"
        ref={chordsBlockRef}
        className="chords-block"
        style={{
          whiteSpace: "pre-wrap",
          backgroundColor: "#0b0b0b",
          padding: "6px 10px",
          borderRadius: 10,
          border: "1px solid #333",
          lineHeight: 1.12,
          fontFamily: "monospace",
          fontSize: Math.round(CHORDS_BASE_FONT_SIZE * chordsScale),
          touchAction: "pan-y",
          WebkitTextSizeAdjust: "100%",
        }}
        dangerouslySetInnerHTML={{ __html: renderedChordsHtml }}
      />

      <style jsx>{`
        .tonicities-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 2px;
        }

        .tonicity-button {
          background: #222;
          color: #fff;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 3px 7px;
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