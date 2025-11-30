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
        <div
          className="score-player sp-mode-horizontal"
          data-file={safeFileUrl}
          data-title={title}
          data-transpose="0"
        >
          {/* --- Κουμπιά plugin --- */}
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
              aria-label="Προβολή παρτιτούρας"
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

          <div className="sp-controls sp-controls-main">
            {/* Transpose */}
            <div className="sp-transpose-wrap">
              <span style={{ marginRight: 4 }}>Μεταφορά:</span>
              <button
                type="button"
                className="sp-btn sp-transpose-down"
                title="Μεταφορά -1"
              >
                −
              </button>
              <span className="sp-transpose-val">0</span>
              <button
                type="button"
                className="sp-btn sp-transpose-up"
                title="Μεταφορά +1"
              >
                +
              </button>
            </div>

            {/* Tempo */}
            <div className="sp-tempo-wrap">
              <span style={{ marginLeft: 12, marginRight: 4 }}>Tempo:</span>
              <button
                type="button"
                className="sp-btn sp-tempo-dec"
                title="Πιο αργά"
              >
                −
              </button>
              <input
                type="number"
                className="sp-tempo"
                defaultValue={120}
                min={30}
                max={300}
                step={1}
                style={{ width: 60 }}
              />
              <button
                type="button"
                className="sp-btn sp-tempo-inc"
                title="Πιο γρήγορα"
              >
                +
              </button>
              <span className="sp-tempo-val">120 BPM</span>
            </div>

            {/* Zoom */}
            <div className="sp-zoom-wrap">
              <span style={{ marginLeft: 12, marginRight: 4 }}>Zoom:</span>
              <input
                type="number"
                className="sp-zoom"
                defaultValue={100}
                min={30}
                max={200}
                step={10}
                style={{ width: 60 }}
              />
            </div>

            {/* Τονικότητα */}
            <div
              className="sp-tonality-wrap"
              style={{ marginLeft: 16, display: "inline-flex", gap: 4 }}
            >
              <span className="sp-tonality-label">Τονικότητα:</span>
              <span className="sp-tonality">—</span>
            </div>

            {/* Προαιρετικό κουμπί εκτύπωσης, αν το χρησιμοποιείς */}
            <button
              type="button"
              className="sp-btn sp-print"
              title="Εκτύπωση παρτιτούρας"
              style={{ marginLeft: 12 }}
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
      <Script src="/score-player/sp-utils.js" strategy="afterInteractive" />
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
