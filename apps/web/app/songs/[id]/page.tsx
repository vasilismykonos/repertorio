import { notFound } from "next/navigation";
import { fetchSongById } from "@/lib/api";
import type { Song } from "@/lib/types";

interface SongPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: SongPageProps) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return { title: "Τραγούδι | Repertorio Next" };
  }

  try {
    const song = await fetchSongById(id);
    return {
      title: `${song.title} | Repertorio Next`
    };
  } catch {
    return { title: "Τραγούδι | Repertorio Next" };
  }
}

export default async function SongPage({ params }: SongPageProps) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    notFound();
  }

  let song: Song;
  try {
    song = await fetchSongById(id);
  } catch (err) {
    notFound();
  }

  return (
    <article>
      <h2>{song.title}</h2>

      <div style={{ fontSize: "0.9rem", opacity: 0.85, marginBottom: "12px" }}>
        {song.category && (
          <span style={{ marginRight: "12px" }}>
            Κατηγορία: <strong>{song.category.title}</strong>
          </span>
        )}
        {song.rythm && (
          <span>
            Ρυθμός: <strong>{song.rythm.title}</strong>
          </span>
        )}
      </div>

      {song.lyrics && (
        <section style={{ marginBottom: "24px" }}>
          <h3>Στίχοι</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              background: "rgba(15, 23, 42, 0.6)",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid rgba(148, 163, 184, 0.4)"
            }}
          >
            {song.lyrics}
          </pre>
        </section>
      )}

      {song.chords && (
        <section style={{ marginBottom: "24px" }}>
          <h3>Συγχορδίες</h3>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              background: "rgba(15, 23, 42, 0.6)",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid rgba(148, 163, 184, 0.4)"
            }}
          >
            {song.chords}
          </pre>
        </section>
      )}

      {song.versions && song.versions.length > 0 && (
        <section>
          <h3>Εκτελέσεις</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {song.versions.map((v) => (
              <li
                key={v.id}
                style={{
                  marginBottom: "8px",
                  paddingBottom: "8px",
                  borderBottom: "1px solid rgba(148, 163, 184, 0.3)"
                }}
              >
                <div>
                  {v.title || song.title} {v.year ? `(${v.year})` : ""}
                </div>
                {v.artists && v.artists.length > 0 && (
                  <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>
                    {v.artists.map((a, idx) => (
                      <span key={idx}>
                        {idx > 0 && ", "}
                        {a.artist.title} [{a.role}]
                      </span>
                    ))}
                  </div>
                )}
                {v.youtubeSearch && (
                  <div style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                    YouTube search: {v.youtubeSearch}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
