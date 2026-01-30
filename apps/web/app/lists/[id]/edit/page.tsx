// apps/web/app/lists/[id]/edit/page.tsx

import type { Metadata } from "next";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

import ListEditClient from "./ListEditClient";

export const dynamic = "force-dynamic";

export type ListGroupSummary = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
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

  // items may exist in real payload (used by ListEditClient normalize)
  items?: any[];
};

type ListsIndexResponse = {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  groups: ListGroupSummary[];
};

type PageProps = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Επεξεργασία λίστας #${params.id} | Repertorio Next` };
}

function toSingleString(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

export default async function ListEditPage({ params, searchParams }: PageProps) {
  const id = Number(params.id);

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Επεξεργασία λίστας</h1>
        <p>Μη έγκυρο ID λίστας.</p>
      </section>
    );
  }

  const currentUser = await getCurrentUserFromApi();
  if (!currentUser) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Επεξεργασία λίστας</h1>
        <p>Πρέπει να είστε συνδεδεμένος.</p>
      </section>
    );
  }

  // pickedSongId (επιστροφή από /songs picker)
  const pickedSongIdRaw = toSingleString(searchParams?.pickedSongId);
  const pickedSongId = pickedSongIdRaw ? Number(pickedSongIdRaw) : null;
  const initialPickedSongId = Number.isFinite(pickedSongId) && (pickedSongId as number) > 0 ? (pickedSongId as number) : null;

  // 1) detail
  let list: ListDetailDto;
  try {
    list = await fetchJson<ListDetailDto>(`/lists/${id}?userId=${currentUser.id}`);
  } catch (err: any) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Επεξεργασία λίστας</h1>
        <p>Αποτυχία ανάκτησης λίστας ({String(err?.message || err)})</p>
      </section>
    );
  }

  // δικαίωμα επεξεργασίας
  const canEdit = list.role === "OWNER" || list.role === "EDITOR";
  if (!canEdit) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Επεξεργασία λίστας</h1>
        <p>Δεν έχετε δικαίωμα επεξεργασίας αυτής της λίστας.</p>
      </section>
    );
  }

  // 2) groups list (για dropdown)
  let groups: ListGroupSummary[] = [];
  try {
    const idx = await fetchJson<ListsIndexResponse>(`/lists?userId=${currentUser.id}&page=1&pageSize=1`);
    groups = Array.isArray(idx?.groups) ? idx.groups : [];
  } catch {
    groups = [];
  }

  return (
    <ListEditClient
      viewerUserId={currentUser.id}
      list={list}
      groups={groups}
      initialPickedSongId={initialPickedSongId}
    />
  );
}
