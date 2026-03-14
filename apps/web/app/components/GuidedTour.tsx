"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Step, CallBackProps } from "react-joyride";
import { STATUS } from "react-joyride";

// ✅ No SSR for Joyride (fixes hydration mismatch)
const Joyride = dynamic(() => import("react-joyride"), { ssr: false });

type Props = {
  storageKey: string;
  steps: Step[];

  /**
   * Όποτε αλλάζει (increment), ξανα-ανοίγει το tour.
   * Δεν βασίζεται σε events.
   */
  openSignal?: number;
};

export default function GuidedTour({ storageKey, steps, openSignal = 0 }: Props) {
  const [mounted, setMounted] = useState(false);
  const [run, setRun] = useState(false);

  useEffect(() => setMounted(true), []);

  // Auto-run μόνο την 1η φορά (βάσει localStorage)
  useEffect(() => {
    if (!mounted) return;

    try {
      const seen = window.localStorage.getItem(storageKey);
      if (!seen) setRun(true);
    } catch {
      setRun(true);
    }
  }, [mounted, storageKey]);

  // Manual re-open (Help button)
  useEffect(() => {
    if (!mounted) return;
    if (openSignal <= 0) return;

    // ✅ force re-run even if it was running before
    setRun(false);
    const t = window.setTimeout(() => setRun(true), 0);
    return () => window.clearTimeout(t);
  }, [mounted, openSignal]);

  function handleCallback(data: CallBackProps) {
    const status = data.status;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // ignore
      }
      setRun(false);
    }
  }

  // ✅ extra safety: no render before mount
  if (!mounted) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      scrollToFirstStep
      spotlightClicks
      styles={{
        options: {
          zIndex: 2147483647,
          backgroundColor: "#ffffff",
          textColor: "#111111",
          primaryColor: "#e11d48",
          arrowColor: "#ffffff",
          overlayColor: "rgba(0,0,0,0.55)",
        },
        // ✅ Overlay/spotlight don't eat clicks
        overlay: { zIndex: 2147483646, pointerEvents: "none" },
        spotlight: { zIndex: 2147483646, pointerEvents: "none" },

        tooltip: {
          zIndex: 2147483647,
          borderRadius: 12,
          padding: 16,
          pointerEvents: "auto",
        },
        tooltipContent: { color: "#111111" },

        buttonNext: {
          color: "#ffffff",
          borderRadius: 10,
          padding: "10px 14px",
          fontWeight: 700,
          pointerEvents: "auto",
        },
        buttonBack: {
          color: "#111111",
          borderRadius: 10,
          padding: "10px 14px",
          fontWeight: 600,
          pointerEvents: "auto",
        },
        buttonSkip: {
          color: "#111111",
          borderRadius: 10,
          padding: "10px 14px",
          fontWeight: 600,
          pointerEvents: "auto",
        },
        buttonClose: { pointerEvents: "auto" },
      }}
      callback={handleCallback}
    />
  );
}