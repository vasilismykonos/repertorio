// apps/web/app/songs/[id]/edit/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

import SongEditForm, {
  type SongForEdit,
  type SongCreditsDto,
  type CategoryOption,
  type RythmOption,
} from "./SongEditForm";

export const dynamic = "force-dynamic";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

function normalizeIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((x) => Math.trunc(Number(x)))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
}

async function fetchSong(id: number): Promise<SongForEdit> {
  const s = await fetchJson<any>(`/songs/${id}?noIncrement=1`);

  return {
    id: Number(s.id),
    title: String(s.title ?? ""),
    firstLyrics: s.firstLyrics ?? null,
    lyrics: s.lyrics ?? null,
    characteristics: s.characteristics ?? null,

    // ✅ legacy strings
    composerName: s.composerName ?? null,
    lyricistName: s.lyricistName ?? null,

    tags: Array.isArray(s.tags)
      ? s.tags.map((t: any) => ({
          id: Number(t.id),
          title: String(t.title ?? ""),
          slug: String(t.slug ?? ""),
        }))
      : [],

    assets: Array.isArray(s.assets)
      ? s.assets.map((a: any) => ({
          id: Number(a.id),
          kind: String(a.kind ?? "LINK") as "LINK" | "FILE",
          type: String(a.type ?? "GENERIC"),
          title: a.title ?? null,
          url: a.url ?? null,
          filePath: a.filePath ?? null,
          mimeType: a.mimeType ?? null,
          sizeBytes: a.sizeBytes ?? null,
          label: a.label ?? null,
          sort: typeof a.sort === "number" ? a.sort : 0,
          isPrimary: Boolean(a.isPrimary),
        }))
      : [],

    originalKey: s.originalKey ?? null,
    chords: s.chords ?? null,
    status: s.status ?? null,

    categoryId: typeof s.categoryId === "number" ? s.categoryId : null,
    rythmId: typeof s.rythmId === "number" ? s.rythmId : null,

    createdByUserId: typeof s.createdByUserId === "number" ? s.createdByUserId : null,

    hasScore: Boolean(s.hasScore),
    scoreFile: s.scoreFile ?? null,

    legacySongId: typeof s.legacySongId === "number" ? s.legacySongId : null,

    versions: Array.isArray(s.versions)
      ? s.versions.map((v: any) => ({
          id: Number(v.id),
          year: typeof v.year === "number" ? v.year : null,
          singerFront: v.singerFront ?? null,
          singerBack: v.singerBack ?? null,
          solist: v.solist ?? null,
          youtubeSearch: v.youtubeSearch ?? null,

          singerFrontIds: Array.isArray(v.singerFrontIds) ? v.singerFrontIds.map(Number) : [],
          singerBackIds: Array.isArray(v.singerBackIds) ? v.singerBackIds.map(Number) : [],
          solistIds: Array.isArray(v.solistIds) ? v.solistIds.map(Number) : [],
        }))
      : [],
  };
}

async function fetchSongCredits(id: number): Promise<SongCreditsDto> {
  // expected payload (βάσει song-credits.service.ts):
  // { composers: [{artistId,...}], lyricists: [{artistId,...}] }
  const c = await fetchJson<any>(`/songs/${id}/credits`);

  const composerArtistIds = normalizeIds(
    Array.isArray(c?.composers) ? c.composers.map((x: any) => x?.artistId) : [],
  );

  const lyricistArtistIds = normalizeIds(
    Array.isArray(c?.lyricists) ? c.lyricists.map((x: any) => x?.artistId) : [],
  );

  return { composerArtistIds, lyricistArtistIds };
}

async function fetchCategories(): Promise<CategoryOption[]> {
  const items = await fetchJson<any[]>(`/categories`);
  return (items ?? []).map((c) => ({
    id: Number(c.id),
    title: String(c.title ?? ""),
  }));
}

async function fetchRythms(): Promise<RythmOption[]> {
  const items = await fetchJson<any[]>(`/rythms`);
  return (items ?? []).map((r) => ({
    id: Number(r.id),
    title: String(r.title ?? ""),
  }));
}

export const metadata: Metadata = {
  title: "Επεξεργασία τραγουδιού | Repertorio Next",
  description: "Φόρμα επεξεργασίας τραγουδιού.",
};

type SongEditPageProps = {
  params: { id: string };
};

const EDIT_ROLES: UserRole[] = ["ADMIN", "EDITOR", "AUTHOR"];

function isPrivilegedRole(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return EDIT_ROLES.includes(role);
}

export default async function SongEditPage({ params }: SongEditPageProps) {
  const songId = Number(params.id);
  if (!Number.isFinite(songId) || songId <= 0) redirect("/songs");

  const [song, credits, currentUser, categories, rythms] = await Promise.all([
    fetchSong(songId),
    fetchSongCredits(songId).catch(() => ({ composerArtistIds: [], lyricistArtistIds: [] })),
    getCurrentUserFromApi().catch(() => null),
    fetchCategories().catch(() => []),
    fetchRythms().catch(() => []),
  ]);

  if (!currentUser) redirect(`/songs/${songId}`);

  const isOwner =
    typeof currentUser.id === "number" &&
    song.createdByUserId != null &&
    currentUser.id === song.createdByUserId;

  const canEdit = isPrivilegedRole(currentUser.role) || isOwner;
  if (!canEdit) redirect(`/songs/${songId}`);

  return (
    <SongEditForm
      song={song}
      credits={credits}
      categories={categories}
      rythms={rythms}
      isOwner={isOwner}
      currentUserRoleLabel={String(currentUser.role)}
      apiBase={API_BASE_URL}
    />
  );
}
