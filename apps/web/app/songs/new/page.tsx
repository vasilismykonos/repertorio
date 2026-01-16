// apps/web/app/songs/new/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { LinkButton } from "@/app/components/buttons";

import { fetchJson } from "@/lib/api";
import {
  getCurrentUserFromApi,
  type UserRole,
  type CurrentUser,
} from "@/lib/currentUser";

import SongEditForm, {
  type SongEditFormSong,
  type SongCredits,
  type CategoryOption,
  type RythmOption,
} from "../[id]/edit/SongEditForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Νέο τραγούδι",
};

function isPrivilegedRole(role?: UserRole | null): boolean {
  return role === "ADMIN" || role === "EDITOR" || role === "AUTHOR";
}

function roleLabel(role?: UserRole | null): string {
  if (!role) return "GUEST";
  return role;
}

export default async function NewSongPage() {
  const currentUser: CurrentUser | null = await getCurrentUserFromApi().catch(
    () => null,
  );

  if (!isPrivilegedRole(currentUser?.role)) {
    redirect("/songs");
  }

  const [categories, rythms] = await Promise.all([
    fetchJson<CategoryOption[]>("/categories", { cache: "no-store" }).catch(
      () => [] as CategoryOption[],
    ),
    fetchJson<RythmOption[]>("/rythms", { cache: "no-store" }).catch(
      () => [] as RythmOption[],
    ),
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
    status: "DRAFT",

    categoryId: null,
    rythmId: null,

    createdByUserId: currentUser?.id ?? null,

    hasScore: false,
    scoreFile: null,

    legacySongId: null,

    versions: [],
  };

  const blankCredits: SongCredits = {
    composerArtistIds: [],
    lyricistArtistIds: [],
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <ActionBar
        left={<h1 className="text-2xl font-semibold">Νέο τραγούδι</h1>}
        right={
          <LinkButton href="/songs" variant="secondary" action="back" title="Πίσω στη λίστα τραγουδιών">

            Επιστροφή
          </LinkButton>
        }
      />

      <SongEditForm
        song={blankSong}
        credits={blankCredits}
        categories={categories}
        rythms={rythms}
        createMode={true}
        isOwner={true}
        currentUserRoleLabel={roleLabel(currentUser?.role)}
        apiBase="/api/v1"
      />
    </main>
  );
}
