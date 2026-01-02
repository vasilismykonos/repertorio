// apps/web/app/songs/new/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { fetchJson } from "@/lib/api";
import {
  getCurrentUserFromApi,
  type UserRole,
} from "@/lib/currentUser";
import SongEditForm, {
  type SongEditFormSong,
  type SongCredits,
  type CategoryOption,
  type RythmOption,
} from "../[id]/edit/SongEditForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Νέο τραγούδι | Repertorio Next",
  description: "Δημιουργία νέου τραγουδιού στο Repertorio Next.",
};

const EDIT_ROLES: UserRole[] = ["ADMIN", "EDITOR", "AUTHOR"];

function isPrivilegedRole(role: UserRole | null | undefined): boolean {
  return role ? EDIT_ROLES.includes(role) : false;
}

async function fetchCategories(): Promise<CategoryOption[]> {
  const items = await fetchJson<any[]>("/categories");
  return (items ?? []).map((c) => ({
    id: Number(c.id),
    title: String(c.title ?? ""),
  }));
}

async function fetchRythms(): Promise<RythmOption[]> {
  const items = await fetchJson<any[]>("/rythms");
  return (items ?? []).map((r) => ({
    id: Number(r.id),
    title: String(r.title ?? ""),
  }));
}

export default async function NewSongPage() {
  const currentUser = await getCurrentUserFromApi().catch(() => null);
  if (!currentUser) {
    redirect("/login");
  }
  if (!isPrivilegedRole(currentUser?.role)) {
    redirect("/songs");
  }
  const [categories, rythms] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchRythms().catch(() => []),
  ]);
  const blankSong: SongEditFormSong = {
    id: 0,
    title: "",
    firstLyrics: null,
    lyrics: null,
    composerName: null,
    lyricistName: null,
    tags: [],
    assets: [],
    characteristics: null,
    originalKey: null,
    chords: null,
    status: null,
    categoryId: null,
    rythmId: null,
    createdByUserId: null,
    hasScore: false,
    scoreFile: null,
    versions: [],
    legacySongId: null,
  };
  const blankCredits: SongCredits = {
    composerArtistIds: [],
    lyricistArtistIds: [],
  };
  return (
    <section style={{ padding: "24px 16px", maxWidth: 920, margin: "0 auto" }}>
      <SongEditForm
        song={blankSong}
        credits={blankCredits}
        currentUser={currentUser}
        categories={categories}
        rythms={rythms}
        createMode={true}
      />
    </section>
  );
}