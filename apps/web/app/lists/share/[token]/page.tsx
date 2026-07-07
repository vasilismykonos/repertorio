// apps/web/app/lists/share/[token]/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";
import ListShareLoginClient from "./ListShareLoginClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ShareLinkDto = {
  token: string;
  listId: number;
  listTitle: string;
  role: "SONGS_EDITOR" | "VIEWER";
  createdAt: string | null;
  expiresAt: string | null;
};

type ShareAcceptDto = {
  listId: number;
  listTitle: string;
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
  grantedRole: "SONGS_EDITOR" | "VIEWER";
  alreadyMember: boolean;
};

type PageProps = {
  params: { token: string };
};

export const metadata: Metadata = {
  title: "Κοινή χρήση λίστας - Repertorio.net",
};

function cleanToken(value: string | undefined) {
  const token = String(value || "").trim();
  return token.length >= 12 ? token : null;
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <section
      style={{
        width: "min(680px, calc(100% - 24px))",
        margin: "clamp(28px, 8vh, 86px) auto",
        padding: "24px",
        borderRadius: 18,
        border: "1px solid rgba(255,100,100,0.28)",
        background: "rgba(255,70,70,0.10)",
        color: "#fff",
      }}
    >
      <h1 style={{ marginTop: 0 }}>Ο σύνδεσμος δεν είναι διαθέσιμος</h1>
      <p style={{ marginBottom: 0, color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>{message}</p>
    </section>
  );
}

export default async function ListSharePage({ params }: PageProps) {
  const token = cleanToken(params.token);
  if (!token) {
    return <ErrorPanel message="Ο σύνδεσμος κοινής χρήσης δεν είναι έγκυρος." />;
  }

  let share: ShareLinkDto;
  try {
    share = await fetchJson<ShareLinkDto>(`/lists/share-links/${encodeURIComponent(token)}`);
  } catch {
    return <ErrorPanel message="Ο σύνδεσμος έχει λήξει, ανακλήθηκε ή δεν υπάρχει." />;
  }

  const currentUser = await getCurrentUserFromApi();
  if (!currentUser) {
    return <ListShareLoginClient listTitle={share.listTitle} role={share.role} />;
  }

  let accepted: ShareAcceptDto;
  try {
    accepted = await fetchJson<ShareAcceptDto>(
      `/lists/share-links/${encodeURIComponent(token)}/accept?userId=${encodeURIComponent(String(currentUser.id))}`,
      { method: "POST" },
    );
  } catch {
    return <ErrorPanel message="Δεν ήταν δυνατή η εφαρμογή των δικαιωμάτων στη λίστα." />;
  }

  redirect(`/lists/${accepted.listId}?shared=1`);
}
