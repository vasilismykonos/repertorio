"use client";

// app/components/ppSplash.tsx

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  durationMs?: number;
  showOnWebAlso?: boolean; // true => και στο web και σε PWA
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export default function PpSplash(props: Props) {
  const { durationMs = 650, showOnWebAlso = true } = props;

  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  const shouldShow = useMemo(() => {
    if (showOnWebAlso) return true;

    if (typeof window === "undefined") return false;
    const isStandalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      // @ts-expect-error - iOS standalone
      (window.navigator && window.navigator.standalone === true);

    return isStandalone;
  }, [showOnWebAlso]);

  useEffect(() => {
    if (!shouldShow) {
      setVisible(false);
      return;
    }

    const reduce = prefersReducedMotion();
    const total = reduce ? Math.min(250, durationMs) : durationMs;

    const t1 = window.setTimeout(() => setFadeOut(true), Math.max(0, total - 180));
    const t2 = window.setTimeout(() => setVisible(false), total);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [durationMs, shouldShow]);

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
        background:
          "radial-gradient(1200px 800px at 50% 40%, #1b1b22 0%, #0b0b0f 45%, #000 100%)",
        transition: "opacity 180ms ease",
        opacity: fadeOut ? 0 : 1,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 220,
          height: 220,
          borderRadius: 28,
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
          display: "grid",
          placeItems: "center",
          transform: fadeOut ? "scale(0.985)" : "scale(1)",
          transition: "transform 180ms ease",
        }}
      >
        <div style={{ position: "relative", width: 160, height: 160 }}>
          {/* Το icon σου */}
          <img
            src="/icons/icon-512x512.png"
            alt=""
            width={160}
            height={160}
            draggable={false}
            style={{
              width: 160,
              height: 160,
              borderRadius: 18,
              userSelect: "none",
              WebkitUserSelect: "none",
              display: "block",
            }}
          />

          {/* Animated “πένα/χέρι” overlay πάνω στο σημείο που παίζει */}
          {!reduce && (
            <svg
              width="160"
              height="160"
              viewBox="0 0 160 160"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
              }}
            >
              {/* θέση/γωνία: ρυθμίζεται εδώ για να “κάτσει” στο δεξί χέρι */}
              <g transform="translate(0,0)">
                <g>
                  {/* “πένα” */}
                  <path
                    d="M0 0 L10 6 L0 12 Z"
                    fill="rgba(255,255,255,0.92)"
                    transform="translate(101 96)"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      values="-14 101 96; 10 101 96; -14 101 96"
                      dur="0.55s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.65; 1; 0.65"
                      dur="0.55s"
                      repeatCount="indefinite"
                    />
                  </path>

                  {/* μικρό “spark” για να φαίνεται η κίνηση */}
                  <circle cx="108" cy="102" r="1.7" fill="rgba(255,255,255,0.75)">
                    <animate
                      attributeName="r"
                      values="1.2; 2.4; 1.2"
                      dur="0.55s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.35; 0.8; 0.35"
                      dur="0.55s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              </g>
            </svg>
          )}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "rgba(255,255,255,0.75)",
            fontFamily: "Verdana, sans-serif",
          }}
        >
          Repertorio
        </div>
      </div>
    </div>
  );
}
