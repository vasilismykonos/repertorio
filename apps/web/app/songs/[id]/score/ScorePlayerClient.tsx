"use client";

import { useEffect, useState, type ReactNode } from "react";
import Script from "next/script";

type Props = {
  fileUrl: string;
  title: string;
  toolbarAction?: ReactNode;
};

declare global {
  interface Window {
    RepScore?: {
      initAllScores?: () => void | Promise<void>;
    };
  }
}

export default function ScorePlayerClient({ fileUrl, title, toolbarAction }: Props) {
  const safeFileUrl = fileUrl || "";
  const [toolsOpen, setToolsOpen] = useState(false);

  function wakeScorePlayer() {
    if (typeof window === "undefined") return;
    const initAllScores = window.RepScore?.initAllScores;
    if (typeof initAllScores === "function") {
      void initAllScores();
    }
  }

  useEffect(() => {
    const timers = [
      window.setTimeout(wakeScorePlayer, 0),
      window.setTimeout(wakeScorePlayer, 250),
      window.setTimeout(wakeScorePlayer, 900),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [safeFileUrl]);

  return (
    <div className={"score-player-embed" + (toolsOpen ? " sp-tools-open" : "")}>
      <div className="sp-quickbar">
        <button
          type="button"
          className="sp-tools-toggle"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((value) => !value)}
        >
          {toolsOpen ? "Κλείσιμο εργαλείων" : "Εργαλεία"}
        </button>
        {toolbarAction}
      </div>
      {/* Wrapper του παλιού Repertorio score player */}
      <div className="score-player-wrap">
        {/* Τίτλος όπως στο παλιό plugin */}
        {title && <div className="score-player-title">{title}</div>}

        <div
          key={safeFileUrl}
          className="score-player sp-mode-horizontal"
          data-file={safeFileUrl}
          data-transpose="0"
        >
          {/* ΠΑΝΩ ΣΕΙΡΑ: Transport + Προβολή (ίδια markup με το παλιό site) */}
          <div className="sp-controls sp-controls-view">
            <div className="sp-transport-top">
              <button type="button" className="sp-btn sp-play" title="Play">
                ▶
              </button>
              <button type="button" className="sp-btn sp-pause" title="Pause">
                ⏸
              </button>
              <button type="button" className="sp-btn sp-stop" title="Stop">
                ⏹
              </button>
            </div>

            <div
              className="sp-view-toggle"
              role="group"
              aria-label="Προβολή"
            >
              <button
                type="button"
                className="sp-btn sp-view-h"
                aria-pressed={true}
                title="Οριζόντια προβολή"
              >
                Γραμμή
              </button>
              <button
                type="button"
                className="sp-btn sp-view-p"
                aria-pressed={false}
                title="Προβολή σε σελίδες"
              >
                Σελίδες
              </button>
            </div>
          </div>

          {/* ΚΑΤΩ ΣΕΙΡΑ: Transpose + Tempo + Zoom (ακριβές clone του παλιού HTML) */}
          <div className="sp-controls">
            {/* Transpose */}
            <button
              type="button"
              className="sp-btn sp-transpose-down"
              title="Transpose −1"
            >
              −
            </button>
            <span
              className="sp-key-badge"
              aria-live="polite"
              title="Τονικότητα (μετά το transpose)"
            />
            <button
              type="button"
              className="sp-btn sp-transpose-up"
              title="Transpose +1"
            >
              +
            </button>

            <div className="sp-sep" />

            {/* Tempo */}
            <label className="sp-tempo-wrap">
              <button
                type="button"
                className="sp-btn sp-tempo-dec"
                title="Tempo −5"
              >
                −
              </button>

              <span className="sp-tempo-box">
                <input
                  className="sp-tempo"
                  type="text"
                  min={1}
                  max={400}
                  step={1}
                  defaultValue={80}
                />
                <span className="sp-tempo-unit">bpm</span>
              </span>

              <button
                type="button"
                className="sp-btn sp-tempo-inc"
                title="Tempo +5"
              >
                +
              </button>
            </label>

            <div className="sp-sep" />

            {/* Zoom */}
            <label className="sp-zoom-wrap">
              <button
                type="button"
                className="sp-btn sp-zoom-out"
                title="Zoom −10%"
              >
                −
              </button>

              <span className="sp-zoom-box">
                <input className="sp-zoom" type="text" defaultValue={100} />
                <span className="sp-zoom-suffix">%</span>
              </span>

              <button
                type="button"
                className="sp-btn sp-zoom-in"
                title="Zoom +10%"
              >
                +
              </button>
            </label>

            <button
              type="button"
              className="sp-btn sp-print"
              title="Εκτύπωση παρτιτούρας"
            >
              🖨
            </button>
          </div>

          <div className="sp-voice-filter" aria-live="polite">
            <div className="sp-voice-filter-title">Φωνές:</div>
            <div className="sp-voice-filter-list" />
          </div>

          {/* εδώ ζωγραφίζει ο OSMD το SVG */}
          <div className="sp-renderer" aria-live="polite" />
        </div>
      </div>

      {/* CSS του player */}
      <link
        rel="stylesheet"
        href="/score-player/score-player.css?v=score-visual-first-20260630j"
      />

      {/* Visual-first load: ο ήχος/JSZip φορτώνονται lazy μόνο όταν χρειαστούν. */}
      <Script
        src="/opensheetmusicdisplay.min.js"
        strategy="afterInteractive"
        onReady={wakeScorePlayer}
      />

      <Script src="/score-player/sp-constants.js" strategy="afterInteractive" onReady={wakeScorePlayer} />
      <Script src="/score-player/score-visual.js" strategy="afterInteractive" onReady={wakeScorePlayer} />
      <Script
        src="/score-player/score-analysis.js"
        strategy="afterInteractive"
        onReady={wakeScorePlayer}
      />
      <Script
        src="/score-player/score-transport.js"
        strategy="afterInteractive"
        onReady={wakeScorePlayer}
      />
      <Script
        src="/score-player/score-player.js?v=score-visual-first-20260630f"
        strategy="afterInteractive"
        onReady={wakeScorePlayer}
      />

      {/* Αρχικοποίηση plugin (ξύπνημα μετά το φόρτωμα των scripts) */}
      <Script id="score-player-init" strategy="afterInteractive">
        {`
          function tryInit() {
            if (!window.RepScore || !window.RepScore.initAllScores) return false;
            window.RepScore.initAllScores();
            return true;
          }
          // Λίγα retries για σιγουριά
          setTimeout(tryInit, 400);
          setTimeout(tryInit, 1200);
          setTimeout(tryInit, 2500);
        `}
      </Script>
    </div>
  );
}
