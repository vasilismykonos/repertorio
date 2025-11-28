// app/songs/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchSongById } from "@/lib/api";
import type { Song } from "@/lib/types";

interface SongPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: SongPageProps) {
  const numericId = Number(params.id);
  if (!Number.isFinite(numericId)) {
    return {
      title: "Τραγούδι | Repertorio Next",
    };
  }

  try {
    const song = (await fetchSongById(numericId)) as Song;
    return {
      title: `${song.title} | Repertorio Next`,
      description:
        song.firstLyrics ?? "Λεπτομέρειες τραγουδιού στο Repertorio Next.",
    };
  } catch {
    return {
      title: "Τραγούδι | Repertorio Next",
    };
  }
}

export default async function SongPage({ params }: SongPageProps) {
  const numericId = Number(params.id);
  if (!Number.isFinite(numericId)) {
    notFound();
  }

  let song: Song;
  try {
    song = (await fetchSongById(numericId)) as Song;
  } catch {
    notFound();
  }

  return (
    <main
      style={{
        maxWidth: "800px",
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <p style={{ marginBottom: "16px" }}>
        <Link href="/songs">← Πίσω στη λίστα τραγουδιών</Link>
      </p>

      <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>{song.title}</h1>

      <p style={{ marginBottom: "4px", color: "#666" }}>
        Κατηγορία:{" "}
        <strong>{song.category ? song.category.title : "—"}</strong>
      </p>

      <p style={{ marginBottom: "4px", color: "#666" }}>
        Ρυθμός:{" "}
        <strong>{song.rythm ? song.rythm.title : "—"}</strong>
      </p>

      <p style={{ marginBottom: "4px", color: "#666" }}>
        Προβολές:{" "}
        <strong>{song.views.toLocaleString("el-GR")}</strong>
      </p>

      {song.characteristics && (
        <p style={{ marginTop: "8px", color: "#555" }}>
          Χαρακτηριστικά: <strong>{song.characteristics}</strong>
        </p>
      )}

      <p
        style={{
          marginTop: "16px",
          marginBottom: "24px",
          color: "#333",
          fontStyle: "italic",
        }}
      >
        Πρώτος στίχος: {song.firstLyrics ? song.firstLyrics : "—"}
      </p>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Στίχοι</h2>
        {song.lyrics ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#fafafa",
              borderRadius: "6px",
              padding: "12px",
              border: "1px solid #eee",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          >
            {song.lyrics}
          </pre>
        ) : (
          <p>Δεν υπάρχουν αποθηκευμένοι στίχοι.</p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>
          Εκτελέσεις / Versions
        </h2>
        {song.versions && song.versions.length > 0 ? (
          <ul>
            {song.versions.map((v) => (
              <li key={v.id} style={{ marginBottom: "8px" }}>
                <strong>{v.title || "Χωρίς τίτλο"}</strong>
                {v.year ? ` (${v.year})` : ""}{" "}
                {v.youtubeUrl && (
                  <a
                    href={v.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: "8px" }}
                  >
                    YouTube
                  </a>
                )}
                {v.artists && v.artists.length > 0 && (
                  <span style={{ marginLeft: "8px", color: "#666" }}>
                    –{" "}
                    {v.artists
                      .map(
                        (a) =>
                          `${a.role}: ${a.artist?.title ?? "Άγνωστος καλλιτέχνης"}`,
                      )
                      .join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>Δεν υπάρχουν καταχωρημένες εκτελέσεις.</p>
        )}
      </section>
    </main>
  );
}
