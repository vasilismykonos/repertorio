// app/songs/page.tsx
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import type { Song } from "@/lib/types";

export const metadata = {
  title: "Τραγούδια | Repertorio Next",
  description: "Λίστα τραγουδιών από το νέο NestJS API (PostgreSQL).",
};

export default async function SongsPage() {
  // Παίρνουμε τα πρώτα 50 τραγούδια από το NestJS API
  const songs = await fetchJson<Song[]>("/songs?take=50&skip=0");

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "28px", marginBottom: "10px" }}>Τραγούδια</h1>

      <p style={{ marginBottom: "20px", opacity: 0.8 }}>
        Τα δεδομένα προέρχονται ζωντανά από το NestJS API (PostgreSQL).
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
                  borderBottom: "1px solid #ddd",
                  padding: "8px",
                }}
              >
                Τίτλος
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ddd",
                  padding: "8px",
                }}
              >
                Κατηγορία
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ddd",
                  padding: "8px",
                  width: "40%",
                }}
              >
                Πρώτος στίχος
              </th>
              <th
                style={{
                  textAlign: "right",
                  borderBottom: "1px solid #ddd",
                  padding: "8px",
                  whiteSpace: "nowrap",
                }}
              >
                Προβολές
              </th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song) => (
              <tr key={song.id}>
                <td
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    padding: "8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Link
                    href={`/songs/${song.id}`}
                    style={{
                      color: "#0070f3",
                      textDecoration: "none",
                    }}
                  >
                    {song.title}
                  </Link>
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    padding: "8px",
                    fontSize: "12px",
                    color: "#555",
                  }}
                >
                  {song.category ? song.category.title : "—"}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    padding: "8px",
                    color: "#555",
                    maxWidth: "0",
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
                    borderBottom: "1px solid #f0f0f0",
                    padding: "8px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {song.views.toLocaleString("el-GR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
