"use client";

// app/components/ppSplash.tsx

import React, { useEffect, useState } from "react";

type Props = {
  durationMs?: number;
  showOnWebAlso?: boolean; // true => και στο web και σε PWA
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

const BOOT_SPLASH_MAX_START_MS = 900;
const SPLASH_FADE_MS = 160;

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    // @ts-expect-error - iOS standalone
    (window.navigator && window.navigator.standalone === true)
  );
}

function ViolinLoadingMark({ reduce }: { reduce: boolean }) {
  return (
    <svg
      width="144"
      height="144"
      viewBox="0 0 144 144"
      aria-hidden="true"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        overflow: "visible",
      }}
    >
      <circle cx="72" cy="72" r="61" fill="rgba(255,255,255,0.055)" />

      <g transform="rotate(-9 72 74)">
        <path d="M72 25 C78 28 79 35 75 39 C71 43 66 39 69 34" fill="none" stroke="#1c0d07" strokeWidth="5" strokeLinecap="round" />
        <rect x="68" y="35" width="8" height="35" rx="4" fill="#1c0d07" />
        <path d="M63 38 L81 38 L77 83 L67 83 Z" fill="#120806" />
        <path
          d="M72 57 C63 44 47 48 49 64 C50 72 60 73 58 82 C55 96 63 109 72 103 C81 109 89 96 86 82 C84 73 94 72 95 64 C97 48 81 44 72 57 Z"
          fill="#b96a2b"
          stroke="#2b1208"
          strokeWidth="2"
        />
        <path d="M61 68 C56 66 56 61 61 59 M83 68 C88 66 88 61 83 59" fill="none" stroke="#170803" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M62 80 C67 76 77 76 82 80" fill="none" stroke="#f4ce86" strokeWidth="2" strokeLinecap="round" />
        <path d="M66 45 L64 102 M70 42 L69 104 M74 42 L75 104 M78 45 L80 102" stroke="#f7ead2" strokeWidth="1" strokeLinecap="round" opacity="0.9" />
      </g>

      <g transform="rotate(-14 72 73)">
        <g>
          {!reduce ? (
            <animateTransform attributeName="transform" type="translate" values="0 -11; 0 11; 0 -11" dur="0.58s" repeatCount="indefinite" />
          ) : null}
          <line x1="31" y1="79" x2="114" y2="65" stroke="#fff4d3" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="31" y1="84" x2="115" y2="70" stroke="#7a421f" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="31" cy="81.5" r="3.5" fill="#241109" />
        </g>
      </g>
    </svg>
  );
}

export default function PpSplash(props: Props) {
  const { durationMs = 420, showOnWebAlso = false } = props;

  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const shouldShow = showOnWebAlso || isStandalonePwa();
    if (!shouldShow) {
      setVisible(false);
      return;
    }

    const startedTooLate = !showOnWebAlso && (window.performance?.now?.() ?? 0) > BOOT_SPLASH_MAX_START_MS;
    if (startedTooLate) return;

    const reduce = prefersReducedMotion();
    const total = reduce ? Math.min(250, durationMs) : durationMs;

    setFadeOut(false);
    setVisible(true);

    const t1 = window.setTimeout(() => setFadeOut(true), Math.max(0, total - SPLASH_FADE_MS));
    const t2 = window.setTimeout(() => setVisible(false), total);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [durationMs, showOnWebAlso]);

  if (!visible) return null;

  const reduce = typeof window !== "undefined" ? prefersReducedMotion() : false;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        padding: 16,
        boxSizing: "border-box",
        background:
          "radial-gradient(1200px 800px at 50% 40%, #1b1b22 0%, #0b0b0f 45%, #000 100%)",
        transition: "opacity 180ms ease",
        opacity: fadeOut ? 0 : 1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "min(220px, calc(100vw - 32px))",
          height: "min(220px, calc(100dvh - 32px))",
          maxHeight: "calc(100vh - 32px)",
          minHeight: 0,
          borderRadius: "clamp(18px, 8vw, 28px)",
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "clamp(10px, 4vw, 18px)",
          boxSizing: "border-box",
          transform: fadeOut ? "scale(0.985)" : "scale(1)",
          transition: "transform 180ms ease",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "min(144px, 72%)",
            height: "min(144px, 72%)",
            minWidth: 0,
            minHeight: 0,
            flex: "0 1 auto",
          }}
        >
          <ViolinLoadingMark reduce={reduce} />
        </div>

        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.75)",
            fontFamily: "Verdana, sans-serif",
            lineHeight: "16px",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          Repertorio
        </div>
      </div>
    </div>
  );
}
