// apps/web/app/lists/[id]/page.tsx
import type { Metadata } from "next";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";
import ListDetailClient from "./ListDetailClient";
import ListOfflineShellClient from "./ListOfflineShellClient";

export const dynamic = "force-dynamic";

/**
 * Shape of a list item returned by the lists API.
 */
export type ListItemDto = {
  listItemId: number;
  listId: number;
  sortId: number;
  transport: number;
  songId: number | null;
  title: string | null;
  songOriginalKey: string | null;
  songOriginalKeySign: "+" | "-" | null;
  selectedTonicity: string | null;
  selectedTonicitySign: "+" | "-" | null;
  selectedSingerTuneId: number | null;
  selectedSingerTuneTitle: string | null;
  selectedSingerTuneTune: string | null;
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
  groupIds?: number[];
  groups?: Array<{
    id: number;
    title: string;
    fullTitle: string | null;
    listsCount?: number;
  }>;
  marked: boolean;
  role:
    | "OWNER"
    | "LIST_EDITOR"
    | "SONGS_EDITOR"
    | "VIEWER";
  items: ListItemDto[];
};

type PageProps = {
  params: { id: string };
  searchParams?: { offlineShell?: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (params.id === "offline-shell") {
    return { title: "Repertorio.net" };
  }

  return { title: "Repertorio.net" };
}

export default async function ListDetailPage({ params, searchParams }: PageProps) {
  if (searchParams?.offlineShell === "1") {
    return <ListOfflineShellClient />;
  }

  const listId = Number(params.id);

  if (!Number.isFinite(listId) || listId <= 0) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστα</h1>
        <p>Μη έγκυρο ID λίστας.</p>
      </section>
    );
  }

  let currentUser: Awaited<ReturnType<typeof getCurrentUserFromApi>>;
  try {
    currentUser = await getCurrentUserFromApi();
  } catch {
    return <ListOfflineShellClient />;
  }

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
    return <ListOfflineShellClient />;
  }

  // Στέλνουμε και το viewerUserId στον client, ώστε τα links των τραγουδιών
  // να συμπεριλάβουν το context για σωστή πλοήγηση.
  return <ListDetailClient listId={listId} viewerUserId={currentUser.id} data={data} />;
}
