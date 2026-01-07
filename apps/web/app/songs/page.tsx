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

async function fetchSongBundle(
  id: number,
): Promise<{ song: SongForEdit; credits: SongCreditsDto }> {
  const s = await fetchJson<any>(`/songs/${id}?noIncrement=1`);

  // ✅ Credits πλέον έρχονται μαζί με το GET /songs/:id (new architecture)
  const composerArtistIds = normalizeIds(
    Array.isArray(s?.credits?.composers)
      ? s.credits.composers.map((x: any) => x?.artistId)
      : [],
  );

  const lyricistArtistIds = normalizeIds(
    Array.isArray(s?.credits?.lyricists)
      ? s.credits.lyricists.map((x: any) => x?.artistId)
      : [],
  );

  const song: SongForEdit = {
    id: Number(s.id),
    title: String(s.title ?? ""),
    firstLyrics: s.firstLyrics ?? null,
    lyrics: s.lyrics ?? null,
    characteristics: s.characteristics ?? null,

    // ✅ legacy strings (fallback)
    composerName: s.composerName ?? null,
    lyricistName: s.lyricistName ?? null,

    tags: Array.isArray(s.tags)
      ? s.tags.map((t: any) => ({
          id: Number(t.id),
          title: String(t.title ?? ""),
          slug: t.slug ?? null,
        }))
      : [],

    assets: Array.isArray(s.assets)
      ? s.assets.map((a: any) => ({
          id: Number(a.id),
          kind: a.kind === "FILE" ? "FILE" : "LINK",
          type: String(a.type ?? ""),
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

    createdByUserId:
      typeof s.createdByUserId === "number" ? s.createdByUserId : null,

    hasScore: Boolean(s.hasScore),
    scoreFile: s.scoreFile ?? null,

    legacySongId:
      typeof s.legacySongId === "number" ? s.legacySongId : null,

    versions: Array.isArray(s.versions)
      ? s.versions.map((v: any) => ({
          id: Number(v.id),
          year: typeof v.year === "number" ? v.year : null,
          youtubeSearch: v.youtubeSearch ?? null,
          singerFront: v.singerFront ?? null,
          singerBack: v.singerBack ?? null,
          solist: v.solist ?? null,
          singerFrontIds: normalizeIds(v.singerFrontIds),
          singerBackIds: normalizeIds(v.singerBackIds),
          solistIds: normalizeIds(v.solistIds),
        }))
      : [],
  };

  return {
    song,
    credits: { composerArtistIds, lyricistArtistIds },
  };
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
  searchParams?: { [key: string]: string | string[] | undefined };
};

const EDIT_ROLES: UserRole[] = ["ADMIN", "EDITOR", "AUTHOR"];

function isPrivilegedRole(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return EDIT_ROLES.includes(role);
}

function parsePositiveInt(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

export default async function SongEditPage({ params, searchParams }: SongEditPageProps) {
  const songId = Number(params.id);
  if (!Number.isFinite(songId) || songId <= 0) redirect("/songs");

  const [bundle, currentUser, categories, rythms] = await Promise.all([
    fetchSongBundle(songId),
    getCurrentUserFromApi().catch(() => null),
    fetchCategories().catch(() => []),
    fetchRythms().catch(() => []),
  ]);
  const { song, credits } = bundle;

  if (!currentUser) redirect(`/songs/${songId}`);

  const isOwner =
    typeof currentUser.id === "number" &&
    song.createdByUserId != null &&
    currentUser.id === song.createdByUserId;

  const canEdit = isPrivilegedRole(currentUser.role) || isOwner;
  if (!canEdit) redirect(`/songs/${songId}`);

  // ✅ Override categoryId from return flow: /songs/:id/edit?categoryId=123
  const overrideCategoryId = parsePositiveInt(searchParams?.categoryId);
  const songForForm: SongForEdit = {
    ...song,
    categoryId: overrideCategoryId != null ? overrideCategoryId : song.categoryId,
  };

  return (
    <SongEditForm
      song={songForForm}
      credits={credits}
      categories={categories}
      rythms={rythms}
      isOwner={isOwner}
      currentUserRoleLabel={String(currentUser.role)}
      apiBase={API_BASE_URL}
    />
  );
}
