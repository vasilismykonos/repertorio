"use client";

import Script from "next/script";

type Props = {
  fileUrl: string;
  title: string;
};

export default function ScorePlayerClient({ fileUrl, title }: Props) {
  const safeFileUrl = fileUrl || "";

  return (
    <div className="score-player-embed">
      {/* Wrapper του παλιού Repertorio score player */}
      <div className="score-player-wrap">
        {/* Τίτλος όπως στο παλιό plugin */}
        {title && <div className="score-player-title">{title}</div>}

        <div
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

          {/* εδώ ζωγραφίζει ο OSMD το SVG */}
          <div className="sp-renderer" aria-live="polite" />
        </div>
      </div>

      {/* CSS του player */}
      <link rel="stylesheet" href="/score-player/score-player.css" />

      {/* OSMD + Tone + JSZip + modules */}
      <Script
        src="/opensheetmusicdisplay.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
        strategy="afterInteractive"
      />

      <Script src="/score-player/sp-constants.js" strategy="afterInteractive" />
      <Script src="/score-player/score-visual.js" strategy="afterInteractive" />
      <Script
        src="/score-player/score-analysis.js"
        strategy="afterInteractive"
      />
      <Script
        src="/score-player/score-transport.js"
        strategy="afterInteractive"
      />
      <Script src="/score-player/score-audio.js" strategy="afterInteractive" />
      <Script src="/score-player/score-player.js" strategy="afterInteractive" />

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
