import { fetchJson } from "@/lib/api";

type Category = {
  id: number;
  title: string;
};

type Song = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;
  views: number;
  status: string;
  category: Category | null;
};

export const metadata = {
  title: "Τραγούδια | Repertorio Next",
  description: "Λίστα τραγουδιών από το νέο NestJS API",
};

export default async function SongsPage() {
  // Θα ζητήσουμε τα πρώτα 50 τραγούδια
  const songs = await fetchJson<Song[]>("/songs?take=50&skip=0");

  return (
    <section>
      <h2>Λίστα τραγουδιών (πρώτα 50)</h2>
      <p style={{ opacity: 0.8, marginBottom: "16px" }}>
        Τα δεδομένα έρχονται live από το NestJS API (PostgreSQL).
      </p>

      {songs.length === 0 ? (
        <p>Δεν βρέθηκαν τραγούδια.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "14px",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #1f2937",
                  padding: "8px",
                }}
              >
                ID
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #1f2937",
                  padding: "8px",
                }}
              >
                Τίτλος
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #1f2937",
                  padding: "8px",
                }}
              >
                Κατηγορία
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #1f2937",
                  padding: "8px",
                }}
              >
                Πρώτοι στίχοι
              </th>
              <th
                style={{
                  textAlign: "right",
                  borderBottom: "1px solid #1f2937",
                  padding: "8px",
                }}
              >
                Views
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #1f2937",
                  padding: "8px",
                }}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song) => (
              <tr key={song.id}>
                <td
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #111827",
                    whiteSpace: "nowrap",
                  }}
                >
                  {song.id}
                </td>
                <td
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #111827",
                  }}
                >
                  {song.title}
                </td>
                <td
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #111827",
                    whiteSpace: "nowrap",
                  }}
                >
                  {song.category?.title ?? "—"}
                </td>
                <td
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #111827",
                    maxWidth: "280px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={song.firstLyrics ?? undefined}
                >
                  {song.firstLyrics ?? "—"}
                </td>
                <td
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #111827",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {song.views}
                </td>
                <td
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #111827",
                    textTransform: "lowercase",
                  }}
                >
                  {song.status.toLowerCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
