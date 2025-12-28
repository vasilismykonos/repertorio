// apps/web/app/lists/[id]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

type ListItemDto = {
  listItemId: number;
  listId: number;
  sortId: number;
  notes: string | null;
  transport: number;
  rythmId: number | null;
  title: string;
  songId: number | null;
  chordsSource: "LIST" | "SONG" | "NONE";
  chords: string | null;
  lyricsSource: "LIST" | "SONG" | "NONE";
  lyrics: string | null;
};

type ListDetailDto = {
  id: number;
  title: string;
  notes: string | null;
  groupId: number | null;
  groupTitle: string | null;
  marked: boolean;
  role: "EDITOR" | "VIEWER";
  items: ListItemDto[];
};

type PageProps = {
  params: { id: string };
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const id = params.id;
  return {
    title: `Λίστα #${id} | Repertorio Next`,
  };
}

// Mapping για transport -> νότα, όπως το $notes_tunes στο παλιό list.php
const TRANSPORT_NOTES: Record<number, string> = {
  101: "Ντο",
  102: "Ντο#",
  103: "Ρε",
  104: "Ρε#",
  105: "Μι",
  106: "Φα",
  107: "Φα#",
  108: "Σολ",
  109: "Σολ#",
  110: "Λα",
  111: "Λα#",
  112: "Σι",
};

function formatTransport(transport: number): string {
  if (!Number.isFinite(transport) || transport === 0) return "";
  if (TRANSPORT_NOTES[transport]) {
    // Στο παλιό list.php τυπωνόταν σε παρένθεση, π.χ. (Ντο)
    return `(${TRANSPORT_NOTES[transport]})`;
  }
  // Fallback: αν δεν υπάρχει mapping, δείχνουμε απλώς αριθμητική μεταφορά
  return transport > 0 ? `+${transport}` : String(transport);
}

export default async function ListDetailPage({ params }: PageProps) {
  const rawId = params.id;
  const id = Number(rawId);

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>Μη έγκυρο ID λίστας.</p>
      </section>
    );
  }

  let currentUser: { id: number } | null = null;

  try {
    currentUser = await getCurrentUserFromApi();
  } catch (err) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>Αποτυχία ανάκτησης στοιχείων χρήστη. ({String(err)})</p>
      </section>
    );
  }

  if (!currentUser) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>Πρέπει να είστε συνδεδεμένος για να δείτε τις λίστες σας.</p>
      </section>
    );
  }

  const apiUrl = `/lists/${id}?userId=${currentUser.id}`;

  let data: ListDetailDto;
  try {
    data = await fetchJson<ListDetailDto>(apiUrl);
  } catch (err: any) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>
          Η λίστα δεν βρέθηκε ή δεν έχετε δικαίωμα να τη δείτε (
          {String(err?.message || err)})
        </p>
      </section>
    );
  }

  const { title, notes, groupTitle, marked, role, items } = data;

  return (
    <section style={{ padding: "1rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.8rem", marginBottom: "0.3rem" }}>
          {marked && (
            <span
              aria-label="Αγαπημένη λίστα"
              title="Αγαπημένη λίστα"
              style={{ color: "#f5a623", marginRight: "0.35rem" }}
            >
              ★
            </span>
          )}
          {title || `Λίστα #${id}`}
        </h1>

        <div
          style={{
            fontSize: "0.9rem",
            color: "#555",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <span>
            Ρόλος:{" "}
            <strong>{role === "EDITOR" ? "Επεξεργαστής" : "Προβολή"}</strong>
          </span>

          <span>
            Ομάδα:{" "}
            {groupTitle ? (
              <strong>{groupTitle}</strong>
            ) : (
              <strong>Χωρίς ομάδα</strong>
            )}
          </span>
        </div>

        {notes && (
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.9rem",
              color: "#444",
            }}
          >
            <strong>Σημειώσεις:</strong> {notes}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <p>Η λίστα δεν περιέχει τραγούδια.</p>
      ) : (
        <div>
          <ul
            id="sortable-list"
            style={{
              listStyleType: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {items.map((item) => {
              const noteLabel = formatTransport(item.transport);
              const titleText =
                item.title || `(αντικείμενο #${item.listItemId})`;
              const displayText = `${item.sortId}. ${titleText}`;
              const songLink =
                item.songId && item.songId > 0 ? `/songs/${item.songId}` : null;

              return (
                <li
                  key={item.listItemId}
                  id={`item_${item.listItemId}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.25rem 0",
                  }}
                >
                  <div
                    className="list-item-info"
                    style={{
                      cursor: songLink ? "pointer" : "default",
                    }}
                  >
                    {songLink ? (
                      <Link
                        href={songLink}
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        {displayText}{" "}
                        {noteLabel && (
                          <span style={{ color: "#4a90e2" }}>{noteLabel}</span>
                        )}
                      </Link>
                    ) : (
                      <>
                        {displayText}{" "}
                        {noteLabel && (
                          <span style={{ color: "#4a90e2" }}>{noteLabel}</span>
                        )}
                      </>
                    )}
                  </div>

                  {role === "EDITOR" && (
                    <div
                      id="edit-listitem-btn"
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.9rem",
                      }}
                    >
                      {/* Στο παλιό site εδώ καλούνταν το modal_button('lists_items', ...) */}
                      ✏️
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <Link
          href="/lists"
          style={{ textDecoration: "none", color: "#0070f3" }}
        >
          ← Επιστροφή στις λίστες
        </Link>
      </div>
    </section>
  );
}
