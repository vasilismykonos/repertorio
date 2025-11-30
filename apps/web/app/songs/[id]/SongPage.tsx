// app/songs/[id]/SongPage.tsx
import { fetchJson } from "@/lib/api";
import SongChordsClient from "./SongChordsClient";
import SongInfoToggle from "./SongInfoToggle";
import Link from "next/link";

type SongVersion = {
  id: number;
  year: number | null;
  singerFront: string | null;
  singerBack: string | null;
  solist: string | null;
  youtubeSearch: string | null;
};

type SongDetail = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;
  characteristics: string | null;
  originalKey: string | null;
  chords: string | null;
  status: string | null;

  // File name or path for the MusicXML/MXL score. If null there is no score
  // available for this song. This property comes from the NestJS API.
  scoreFile: string | null;

  // “εμπλουτισμένα” πεδία από το API
  categoryTitle: string | null;
  composerName: string | null;
  lyricistName: string | null;
  rythmTitle: string | null;
  basedOnSongId: number | null;
  basedOnSongTitle: string | null;
  views: number | null;
  versions: SongVersion[] | null;
};

type SongPageProps = {
  params: {
    id: string;
  };
};

// Βοηθητικό slug (σαν sanitize_title)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Πρώτες 5 λέξεις για YouTube search
function getFirstWordsForYoutube(
  firstLyrics: string | null,
  lyrics: string | null
): string {
  const source = firstLyrics || lyrics || "";
  if (!source.trim()) return "";
  const words = source.trim().split(/\s+/).slice(0, 5);
  return words.join(" ");
}

// Schema.org MusicComposition (αντίστοιχο generate_song_schema)
function renderSongSchema(song: SongDetail) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name: song.title,
    composer: song.composerName
      ? {
          "@type": "Person",
          name: song.composerName,
        }
      : undefined,
    lyricist: song.lyricistName
      ? {
          "@type": "Person",
          name: song.lyricistName,
        }
      : undefined,
    genre: song.categoryTitle || undefined,
    inLanguage: "el",
    lyrics:
      song.lyrics && song.lyrics.trim() !== ""
        ? song.lyrics
        : "Χωρίς διαθέσιμους στίχους",
    isAccessibleForFree: true,
    url: `https://repertorio.net/songs/song/${song.id}-${slugify(
      song.title
    )}/`,
  };

  const json = JSON.stringify(schema, null, 2);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

// Δυναμικός τίτλος σελίδας (σαν το παλιό wp_title / meta)
export async function generateMetadata({ params }: SongPageProps) {
  const songId = Number(params.id);
  if (!songId || Number.isNaN(songId)) {
    return {
      title: "Μη έγκυρο τραγούδι | Repertorio Next",
    };
  }

  let song: SongDetail | null = null;
  try {
    song = await fetchJson<SongDetail>(`/songs/${songId}`);
  } catch {
    // Αν αποτύχει το fetch, δώσε generic τίτλο
  }

  if (!song) {
    return {
      title: "Τραγούδι | Repertorio Next",
    };
  }

  const parts = [song.title];
  if (song.composerName) {
    parts.push(song.composerName);
  }
  const baseTitle = parts.join(" - ");

  return {
    title: `${baseTitle} | Repertorio Next`,
    description: song.firstLyrics || song.lyrics || undefined,
    alternates: {
      canonical: `https://repertorio.net/songs/song/${song.id}-${slugify(
        song.title
      )}/`,
    },
  };
}

export default async function SongPage({ params }: SongPageProps) {
  const songId = Number(params.id);

  if (!songId || Number.isNaN(songId)) {
    return (
      <section
        style={{
          padding: "24px 16px",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <p>Μη έγκυρο ID τραγουδιού.</p>
      </section>
    );
  }

  const song = await fetchJson<SongDetail>(`/songs/${songId}`);

  // Λογική "Οργανικό" / "Χωρίς στίχους" όπως στο παλιό PHP
  const isOrganic =
    song.characteristics?.split(",").some((c) => c.trim() === "Οργανικό") ??
    false;

  let finalLyrics: string;
  if (isOrganic) {
    finalLyrics = "(Οργανικό)";
  } else if (!song.lyrics || song.lyrics.trim() === "") {
    finalLyrics = "(Χωρίς διαθέσιμους στίχους)";
  } else {
    finalLyrics = song.lyrics;
  }

  const firstWords = getFirstWordsForYoutube(song.firstLyrics, song.lyrics);
  const youtubeSearchQuery = `${song.title} ${firstWords}`.trim();
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    youtubeSearchQuery
  )}&app=revanced`;

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      {/* Κουμπιά πάνω δεξιά – Παρτιτούρα / YouTube */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {/* Παρτιτούρα – σύνδεση στη σελίδα score αν υπάρχει διαθέσιμη */}
        {song.scoreFile ? (
          <Link
            href={`/songs/${song.id}/score`}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #333",
              background: "#111",
              color: "#fff",
              textDecoration: "none",
              display: "inline-block",
            }}
            title="Προβολή παρτιτούρας"
          >
            📄 Παρτιτούρα
          </Link>
        ) : (
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#222",
              color: "#666",
              display: "inline-block",
            }}
            title="Δεν υπάρχει διαθέσιμη παρτιτούρα"
          >
            📄 Παρτιτούρα
          </span>
        )}

        {/* YouTube button όπως στο παλιό youtubetbutton */}
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #c00",
            background: "#c00",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
          title="Αναζήτηση στο YouTube"
        >
          ▶ YouTube
        </a>
      </div>

      {/* Τίτλος τραγουδιού */}
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>
          {song.title}
        </h1>
      </header>

      {/* Διαχωριστική γραμμή (σαν search-results-linedown) */}
      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, #444, transparent)",
          marginBottom: 16,
        }}
      />

      {/* INFO ΠΑΝΩ ΑΠΟ ΤΙΣ ΣΥΓΧΟΡΔΙΕΣ – αντίστοιχο display_info + display_rythm + versions */}
      <SongInfoToggle
        categoryTitle={song.categoryTitle}
        composerName={song.composerName}
        lyricistName={song.lyricistName}
        rythmTitle={song.rythmTitle}
        basedOnSongTitle={song.basedOnSongTitle}
        basedOnSongId={song.basedOnSongId}
        characteristics={song.characteristics}
        views={song.views}
        status={song.status}
        versions={song.versions}
      />

      {/* Συγχορδίες με transporto (αν υπάρχουν) */}
      {song.chords && song.chords.trim() !== "" && (
        <SongChordsClient chords={song.chords} originalKey={song.originalKey} />
      )}

      {/* Στίχοι (με λογική Οργανικό / Χωρίς στίχους) */}
      <section style={{ marginTop: 24, marginBottom: 32 }}>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            backgroundColor: "#111",
            padding: "16px",
            borderRadius: 8,
            border: "1px solid #333",
            lineHeight: 1.6,
            fontFamily: "inherit",
            fontSize: "1rem",
          }}
        >
          {finalLyrics}
        </pre>
      </section>

      {/* Schema.org JSON-LD */}
      {renderSongSchema(song)}
    </section>
  );
}
