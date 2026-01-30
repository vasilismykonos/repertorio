// apps/web/app/lists/[id]/page.tsx
import type { Metadata } from "next";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";
import ListDetailClient from "./ListDetailClient";

export const dynamic = "force-dynamic";

/**
 * Shape of a list item returned by the lists API.
 */
export type ListItemDto = {
  listItemId: number;
  listId: number;
  sortId: number;
  songId: number | null;
  title: string | null;
  chords: string | null;
  chordsSource: "LIST" | "SONG" | "NONE";
  lyrics: string | null;
  lyricsSource: "LIST" | "SONG" | "NONE";
};

export type ListDetailDto = {
  id: number;
  title: string;
  // aliases (keep for completeness)
  name: string;
  listTitle: string;
  list_title: string;
  groupId: number | null;
  groupTitle: string | null;
  groupFullTitle: string | null;
  marked: boolean;
  role: "OWNER" | "EDITOR" | "VIEWER";
  items: ListItemDto[];
};

type PageProps = {
  params: { id: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Λίστα #${params.id} | Repertorio Next` };
}

export default async function ListDetailPage({ params }: PageProps) {
  const listId = Number(params.id);
  if (!Number.isFinite(listId) || listId <= 0) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>Μη έγκυρο ID λίστας.</p>
      </section>
    );
  }

  const currentUser = await getCurrentUserFromApi();
  if (!currentUser) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>Πρέπει να είστε συνδεδεμένος για να δείτε τις λίστες σας.</p>
      </section>
    );
  }

  const apiUrl = `/lists/${listId}?userId=${currentUser.id}`;
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

  // Στέλνουμε και το viewerUserId στον client, ώστε τα links των τραγουδιών
  // να συμπεριλάβουν το context για σωστή πλοήγηση.
  return <ListDetailClient listId={listId} viewerUserId={currentUser.id} data={data} />;
}
