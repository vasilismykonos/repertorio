import { fetchJson } from "@/lib/api";
import Link from "next/link";
import Script from "next/script";

type SongDetail = {
  id: number;
  title: string;
  scoreFile: string | null;
};

type PageProps = {
  params: {
    id: string;
  };
};

export const metadata = {
  title: "Παρτιτούρα τραγουδιού | Repertorio Next",
  description: "Προβολή παρτιτούρας τραγουδιού από το νέο Repertorio.",
};

export default async function SongScorePage({ params }: PageProps) {
  const songId = Number(params.id);

  if (Number.isNaN(songId) || songId <= 0) {
    throw new Error("Μη έγκυρο song id");
  }

  const song = await fetchJson<SongDetail>(`/songs/${songId}`);

  if (!song || !song.id) {
    throw new Error("Το τραγούδι δεν βρέθηκε");
  }

// Πλέον φορτώνουμε ΠΑΝΤΑ από το API που ξεζιπάρει το MXL σε XML
let scoreUrl = `/api/scores/${song.id}`;

// Αν στο μέλλον θες override με πλήρες URL/απλό XML:
if (
  song.scoreFile &&
  (song.scoreFile.startsWith("http://") ||
    song.scoreFile.startsWith("https://") ||
    song.scoreFile.startsWith("/api/scores/"))
) {
  scoreUrl = song.scoreFile;
}


  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Παρτιτούρα: {song.title}
        </h1>
        <p style={{ opacity: 0.8 }}>
          Η παρτιτούρα φορτώνεται από το αρχείο:{" "}
          <code style={{ fontSize: "0.9em" }}>{scoreUrl}</code>
        </p>
      </header>

      <div
        className="score-player"
        data-file={scoreUrl}
        data-transpose="0"
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 12,
          minHeight: 200,
          backgroundColor: "#ffffff",
        }}
      ></div>

      <p style={{ marginTop: 16 }}>
        <Link href={`/songs/${songId}`} style={{ color: "#4dabff" }}>
          ← Επιστροφή στη σελίδα του τραγουδιού
        </Link>
      </p>

      <link rel="stylesheet" href="/score-player/score-player.css" />

      <Script
        src="https://unpkg.com/opensheetmusicdisplay@1.7.6/build/opensheetmusicdisplay.min.js"
        strategy="afterInteractive"
      />

      <Script
        src="/score-player/score-player-bundle.js"
        strategy="afterInteractive"
      />

      <Script id="score-player-init" strategy="afterInteractive">
        {`
          function tryInitScores() {
            if (window.RepScore && typeof window.RepScore.initAllScores === 'function') {
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
