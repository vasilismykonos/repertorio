import { fetchJson } from "@/lib/api";
import Link from "next/link";
import Script from "next/script";

type SongDetail = {
  id: number;
  title: string;
};

type PageProps = {
  params: {
    id: string;
  };
};

export const dynamic = "force-dynamic";

export default async function SongScorePage({ params }: PageProps) {
  const songId = Number(params.id);

  if (!Number.isFinite(songId) || songId <= 0) {
    throw new Error("Invalid song id");
  }

  const song = await fetchJson<SongDetail>(`/songs/${songId}`);

  const scoreUrl = `/api/scores/${songId}`;

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: "1.4rem",
            marginBottom: 4,
          }}
        >
          Παρτιτούρα: {song.title}
        </h1>
        <p style={{ fontSize: "0.9rem", opacity: 0.8, marginBottom: 8 }}>
          Η παρτιτούρα φορτώνεται από τα αρχεία MXL/XML του νέου συστήματος
          (φάκελος <code>/public/scores</code>) και αποδίδεται με τον ίδιο
          player (OSMD + Tone.js) που είχες στο παλιό WordPress.
        </p>
        <Link href={`/songs/${songId}`} style={{ fontSize: "0.9rem" }}>
          ← Επιστροφή στο τραγούδι
        </Link>
      </header>

      {/* Wrapper του Repertorio score player (ίδιος με το παλιό plugin) */}
      <div className="score-player-wrap">
        <div
          className="score-player sp-mode-horizontal"
          data-file={scoreUrl}
          data-transpose="0"
        >
          {/* Πάνω σειρά: transport + προβολή */}
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

          {/* Δεύτερη σειρά: transpose + tempo + zoom + τονικότητα */}
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
              {/* Τα κουμπιά zoom +/- θα τα δημιουργήσει μόνο του το JS αν λείπουν */}
            </div>

            {/* Τονικότητα (badge έξω από το SVG) */}
            <div
              className="sp-tonality-wrap"
              style={{ marginLeft: 16, display: "inline-flex", gap: 4 }}
            >
              <span className="sp-tonality-label">Τονικότητα:</span>
              <span className="sp-tonality">—</span>
            </div>
          </div>

          {/* Εκεί μέσα θα ρίξει ο OSMD το SVG, όπως παλιά */}
          <div className="sp-renderer" aria-live="polite" />
        </div>
      </div>

      {/* Scripts: OSMD + Tone + παλιός Repertorio score player (από το plugin) */}
      <Script
        src="/opensheetmusicdisplay.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.27/build/Midi.min.js"
        strategy="afterInteractive"
      />

      {/* Τα modules από το παλιό plugin – αντιγράφεις τα αντίστοιχα αρχεία σε /public/score-player */}
      <Script
        src="/score-player/sp-constants.js"
        strategy="afterInteractive"
      />
      <Script src="/score-player/sp-utils.js" strategy="afterInteractive" />
      <Script
        src="/score-player/score-visual.js"
        strategy="afterInteractive"
      />
      <Script
        src="/score-player/score-analysis.js"
        strategy="afterInteractive"
      />
      <Script
        src="/score-player/score-transport.js"
        strategy="afterInteractive"
      />
      <Script
        src="/score-player/score-audio.js"
        strategy="afterInteractive"
      />
      <Script
        src="/score-player/score-player.js"
        strategy="afterInteractive"
      />

      {/* Αρχικοποίηση – ίδιο μοτίβο με το σχόλιο μέσα στο score-player.js */}
      <Script id="score-player-init" strategy="afterInteractive">
        {`
          function tryInitScores() {
            if (
              window.RepScore &&
              typeof window.RepScore.initAllScores === "function"
            ) {
              window.RepScore.initAllScores();
              return true;
            }
            return false;
          }

          if (!tryInitScores()) {
            setTimeout(tryInitScores, 500);
            setTimeout(tryInitScores, 1500);
          }
        `}
      </Script>
    </section>
  );
}
