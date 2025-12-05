// app/songs/page.tsx
import Link from "next/link";
import { fetchJson } from "@/lib/api";

// Τύποι όπως γυρίζουν από το NestJS /songs/search
type SongSearchItem = {
  song_id: number;
  title: string;
  firstLyrics: string;
  lyrics: string;
  characteristics: string;
  originalKey: string;
  chords: number;
  partiture: number;
  status: string;
  score: number;
};

type SongsSearchResponse = {
  total: number;
  items: SongSearchItem[];
};

export const metadata = {
  title: "Τραγούδια | Repertorio Next",
  description:
    "Λίστα τραγουδιών από το νέο NestJS API (PostgreSQL / Elasticsearch).",
};

type SongsPageProps = {
  searchParams?: {
    q?: string;
    search_term?: string;
    skip?: string;
    take?: string;
    createdByUserId?: string; // <-- προσθήκη
  };
};

export default async function SongsPage({ searchParams }: SongsPageProps) {
  const take = Number(searchParams?.take ?? "50");
  const skip = Number(searchParams?.skip ?? "0");

  // Υποστήριξη και q και search_term από το URL
  const q = (searchParams?.q || searchParams?.search_term || "").trim();

  // ΝΕΟ: υποστήριξη φίλτρου createdByUserId
  const createdByUserIdRaw = searchParams?.createdByUserId;
  const createdByUserId =
    createdByUserIdRaw && !Number.isNaN(Number(createdByUserIdRaw))
      ? Number(createdByUserIdRaw)
      : undefined;

  // Χτίζουμε τα query params για το Nest API
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", String(skip));
  if (q) {
    params.set("q", q);
  }
  if (createdByUserId !== undefined) {
    params.set("createdByUserId", String(createdByUserId));
  }

  // Καλούμε το NestJS API: /songs/search (proxy μέσω web)
  const data = await fetchJson<SongsSearchResponse>(
    "/songs/search?" + params.toString(),
  );

  const songs = data.items;

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>
          Τραγούδια
        </h1>
        <p style={{ opacity: 0.8 }}>
          Τα δεδομένα προέρχονται ζωντανά από το νέο NestJS API (PostgreSQL /
          Elasticsearch).
        </p>

        {q && (
          <p style={{ marginTop: 8 }}>
            Φράση αναζήτησης: <strong>{q}</strong> (σύνολο: {data.total})
          </p>
        )}

        {createdByUserId !== undefined && (
          <p style={{ marginTop: 4 }}>
            Φιλτραρισμένα τραγούδια του χρήστη με ID{" "}
            <strong>{createdByUserId}</strong> (σύνολο: {data.total})
          </p>
        )}
      </header>

      {songs.length === 0 ? (
        <p>Δεν βρέθηκαν τραγούδια.</p>
      ) : (
        <div
          style={{
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            overflow: "hidden",
            backgroundColor: "#111",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.95rem",
            }}
          >
            <thead
              style={{
                backgroundColor: "#222",
                textAlign: "left",
                borderBottom: "1px solid #444",
              }}
            >
              <tr>
                <th style={{ padding: "10px 12px" }}>Τίτλος</th>
                <th style={{ padding: "10px 12px" }}>Πρώτοι στίχοι</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>
                  Βαθμολογία (score)
                </th>
                <th style={{ padding: "10px 12px" }}>Κατάσταση</th>
                <th style={{ padding: "10px 12px" }}>Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => (
                <tr
                  key={song.song_id}
                  style={{ borderBottom: "1px solid #333" }}
                >
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                    <Link
                      href={`/songs/${song.song_id}`}
                      style={{ color: "#4dabff", textDecoration: "none" }}
                    >
                      {song.title}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      maxWidth: 380,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={song.firstLyrics || song.lyrics || ""}
                  >
                    {song.firstLyrics || song.lyrics || "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {song.score?.toFixed(2) ?? "—"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: "0.78rem",
                        border: "1px solid #555",
                        backgroundColor: "#222",
                      }}
                    >
                      {song.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <Link
                      href={`/songs/${song.song_id}`}
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #4dabff",
                        fontSize: "0.82rem",
                        textDecoration: "none",
                        color: "#4dabff",
                      }}
                    >
                      Προβολή
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 16, fontSize: "0.85rem", opacity: 0.7 }}>
        Αυτή τη στιγμή εμφανίζονται τα πρώτα {take} τραγούδια (skip {skip}).
      </p>
    </section>
  );
}
