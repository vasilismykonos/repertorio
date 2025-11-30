import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import ScorePlayerClient from "@/app/components/ScorePlayerClient";

// Αν θέλεις να μη γίνεται πλήρες static build για κάθε τραγούδι
export const dynamic = "force-dynamic";

type SongCategory = {
  id: number;
  title: string;
};

type SongDetail = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;
  views: number;
  status: string;
  category: SongCategory | null;
  // Αν στο μέλλον προσθέσεις extra πεδία (scoreFile, rythm κτλ.),
  // μπορείς απλά να τα δηλώσεις εδώ χωρίς να πειραχτεί ο κώδικας.
};

export const metadata = {
  title: "Τραγούδι | Repertorio Next",
  description: "Σελίδα τραγουδιού από το νέο Repertorio.",
};

type PageProps = {
  params: {
    id: string;
  };
};

export default async function SongPage({ params }: PageProps) {
  const songId = Number(params.id);

  if (Number.isNaN(songId) || songId <= 0) {
    notFound();
  }

  // Φέρνουμε το τραγούδι από το NestJS API
  let song: SongDetail;
  try {
    song = await fetchJson<SongDetail>(`/songs/${songId}`);
  } catch (e) {
    // Αν το API γυρίσει 404 ή σφάλμα, δείχνουμε 404 σελίδα Next
    notFound();
  }

  if (!song || !song.id) {
    notFound();
  }

  const hasLyrics =
    (song.lyrics && song.lyrics.trim().length > 0) ||
    (song.firstLyrics && song.firstLyrics.trim().length > 0);

  return (
    <main
      style={{
        padding: "24px 16px",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      {/* Πλοήγηση πίσω στη λίστα τραγουδιών */}
      <p style={{ marginBottom: 16 }}>
        <Link href="/songs" style={{ color: "#4dabff" }}>
          ← Πίσω στη λίστα τραγουδιών
        </Link>
      </p>

      {/* Κεφαλίδα τραγουδιού */}
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: "1.8rem",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          {song.title}
        </h1>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 14,
            opacity: 0.9,
          }}
        >
          {song.category && (
            <span
              style={{
                borderRadius: 999,
                padding: "2px 10px",
                border: "1px solid #ddd",
                backgroundColor: "#f7f7f7",
              }}
            >
              Κατηγορία: {song.category.title}
            </span>
          )}

          <span
            style={{
              borderRadius: 999,
              padding: "2px 10px",
              border: "1px solid #eee",
              backgroundColor: "#fafafa",
            }}
          >
            Προβολές: {song.views ?? 0}
          </span>

          <span
            style={{
              borderRadius: 999,
              padding: "2px 10px",
              border: "1px solid #eee",
              backgroundColor: "#fafafa",
            }}
          >
            Κατάσταση: {song.status || "—"}
          </span>
        </div>
      </header>

      {/* Στίχοι (απλή εμφάνιση για αρχή) */}
      {hasLyrics && (
        <section
          style={{
            marginBottom: 32,
            padding: 16,
            borderRadius: 8,
            background: "#fafafa",
            border: "1px solid #e0e0e0",
          }}
        >
          <h2
            style={{
              fontSize: "1.2rem",
              marginTop: 0,
              marginBottom: 10,
            }}
          >
            Στίχοι
          </h2>

          {song.lyrics ? (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {song.lyrics}
            </pre>
          ) : song.firstLyrics ? (
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              {song.firstLyrics}
            </p>
          ) : null}
        </section>
      )}

      {/* Παρτιτούρα – ScorePlayerClient με το songId */}
      <section
        style={{
          marginBottom: 32,
        }}
      >
        <h2
          style={{
            fontSize: "1.2rem",
            marginTop: 0,
            marginBottom: 10,
          }}
        >
          Παρτιτούρα
        </h2>

        {/* 
          Ο player θα καλέσει /api/scores/{songId}
          και θα χειριστεί μόνος του τα σφάλματα (π.χ. αν δεν υπάρχει MXL).
        */}
        <ScorePlayerClient songId={songId} initialZoom={100} />
      </section>
    </main>
  );
}
