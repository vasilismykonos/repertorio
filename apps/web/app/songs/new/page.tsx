// apps/web/app/songs/new/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

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
    fetchJson<CategoryOption[]>(`${API_BASE_URL}/categories`, {
      cache: "no-store",
    }).catch(() => [] as CategoryOption[]),
    fetchJson<RythmOption[]>(`${API_BASE_URL}/rythms`, {
      cache: "no-store",
    }).catch(() => [] as RythmOption[]),
  ]);

  const blankSong: SongEditFormSong = {
    id: 0,
    title: "",
    firstLyrics: null,
    lyrics: null,

    // legacy fallback strings (προαιρετικά στο type)
    composerName: null,
    lyricistName: null,

    // ✅ στο edit το source-of-truth για UI είναι tags (όχι tagIds)
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Νέο τραγούδι</h1>
        <Link className="text-sm underline" href="/songs">
          Επιστροφή
        </Link>
      </div>

      <SongEditForm
        song={blankSong}
        credits={blankCredits}
        categories={categories}
        rythms={rythms}
        createMode={true}
        // ✅ αντί για currentUser prop
        isOwner={true}
        currentUserRoleLabel={roleLabel(currentUser?.role)}
        apiBase={API_BASE_URL}
      />
    </main>
  );
}
