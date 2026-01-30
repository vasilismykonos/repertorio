// apps/web/app/songs/[id]/page.tsx

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";
import SongSendToRoomButton from "./SongSendToRoomButton";
import SongPageClient from "./SongPageClient";

export const dynamic = "force-dynamic";

type TagDto = {
  id: number;
  title: string;
  slug: string;
};

type SongVersion = {
  id: number;
  year: number | null;
  singerFront: string | null;
  singerBack: string | null;
  solist: string | null;
  youtubeSearch: string | null;

  singerFrontId?: number | null;
  singerBackId?: number | null;
  solistId?: number | null;
};

export type SongDetail = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;
  characteristics: string | null;
  originalKey: string | null;
  originalKeySign: "+" | "-" | null;
  chords: string | null;
  status: string | null;

  categoryId?: number | null;
  rythmId?: number | null;
  makamId?: number | null;

  categoryTitle: string | null;
  composerName: string | null;
  lyricistName: string | null;
  rythmTitle: string | null;
  basedOnSongId: number | null;
  basedOnSongTitle: string | null;

  views: number;

  createdByUserId?: number | null;
  createdByDisplayName?: string | null;

  tags: TagDto[];

  hasScore: boolean;
  scoreFile: string | null;

  versions: SongVersion[];
};

type SongPageProps = {
  params: { id: string };
};

type RedirectDefault = "TITLE" | "CHORDS" | "LYRICS" | "SCORE";

// Βοηθητικό slug (σαν sanitize_title)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Πρώτες 5 λέξεις για YouTube search
function getFirstWordsForYoutube(firstLyrics: string | null, lyrics: string | null): string {
  const source = firstLyrics || lyrics || "";
  if (!source.trim()) return "";
  const words = source.trim().split(/\s+/).slice(0, 5);
  return words.join(" ");
}

function cleanText(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return cleanText(String(v));
  const s = v.trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "NULL" || u === "UNDEFINED" || u === "N/A") return null;
  return s;
}

function pickText(...candidates: any[]): string | null {
  for (const c of candidates) {
    const x = cleanText(c);
    if (x) return x;
  }
  return null;
}

function normalizeVersions(raw: any): SongVersion[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];

  return raw.map((v: any, idx: number) => {
    const id = v.id ?? v.versionId ?? v.version_id ?? idx + 1;
    const year = v.year ?? v.Year ?? v.releaseYear ?? v.release_year ?? null;

    const singerFront = pickText(
      v.singerFront,
      v.singer_front,
      v.singerfront,
      v.singer_front_name,
      v.singerFrontName,
      v.singer_front_titles,
      v.singerFrontTitle,
    );

    const singerBack = pickText(
      v.singerBack,
      v.singer_back,
      v.singerback,
      v.singer_back_name,
      v.singerBackName,
    );

    const solist = pickText(
      v.solist,
      v.soloist,
      v.solist_name,
      v.soloist_name,
      v.solistName,
      v.soloistName,
    );

    const youtubeSearch = pickText(
      v.youtubeSearch,
      v.youtube_search,
      v.youtubeQuery,
      v.youtube_query,
    );

    const singerFrontId = v.singerFrontId ?? v.singer_front_id ?? v.singerfront_id ?? null;
    const singerBackId = v.singerBackId ?? v.singer_back_id ?? v.singerback_id ?? null;
    const solistId = v.solistId ?? v.soloistId ?? v.solist_id ?? v.soloist_id ?? null;

    return {
      id: Number(id),
      year: typeof year === "number" ? year : year ? Number(year) : null,
      singerFront,
      singerBack,
      solist,
      youtubeSearch,
      singerFrontId: singerFrontId != null ? Number(singerFrontId) : null,
      singerBackId: singerBackId != null ? Number(singerBackId) : null,
      solistId: solistId != null ? Number(solistId) : null,
    };
  });
}

function normalizeTags(raw: any): TagDto[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  const map = new Map<number, TagDto>();

  for (const t of raw) {
    const id = Number(t?.id);
    const title = String(t?.title ?? "").trim();
    const slug = String(t?.slug ?? "").trim();
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!title) continue;
    if (!map.has(id)) map.set(id, { id, title, slug });
  }

  return Array.from(map.values());
}

// Schema.org MusicComposition
function renderSongSchema(song: SongDetail) {
  const schema: any = {
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name: song.title,
    composer: song.composerName ? { "@type": "Person", name: song.composerName } : undefined,
    lyricist: song.lyricistName ? { "@type": "Person", name: song.lyricistName } : undefined,
    genre: song.categoryTitle || undefined,
    inLanguage: "el",
    lyrics: song.lyrics && song.lyrics.trim() !== "" ? song.lyrics : "Χωρίς διαθέσιμους στίχους",
    isAccessibleForFree: true,
    url: `https://repertorio.net/songs/song/${song.id}-${slugify(song.title)}/`,
  };

  const json = JSON.stringify(schema, null, 2);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export async function generateMetadata({ params }: SongPageProps) {
  const songId = Number(params.id);
  if (!songId || Number.isNaN(songId)) {
    return { title: "Μη έγκυρο τραγούδι | Repertorio Next" };
  }

  let song: any = null;
  try {
    song = await fetchJson<any>(`/songs/${songId}?noIncrement=1`);
  } catch {
    // ignore
  }

  if (!song) {
    return { title: "Τραγούδι | Repertorio Next" };
  }

  const title: string = song.title ?? "Τραγούδι";
  const composerName: string | undefined = song.composerName ?? song.composer_name ?? undefined;

  const parts = [title];
  if (composerName) parts.push(composerName);

  const baseTitle = parts.join(" - ");

  const firstLyrics: string | undefined = song.firstLyrics ?? song.first_lyrics ?? undefined;
  const lyrics: string | undefined = song.lyrics ?? undefined;

  return {
    title: `${baseTitle} | Repertorio Next`,
    description: firstLyrics || lyrics || undefined,
    alternates: { canonical: `https://repertorio.net/songs/song/${songId}-${slugify(title)}/` },
  };
}

const EDIT_ROLES: UserRole[] = ["ADMIN", "EDITOR", "AUTHOR"];
function isPrivilegedRole(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return EDIT_ROLES.includes(role);
}

/**
 * Διαβάζει prefs από user.profile όπως στο MePageClient.tsx
 * και επιστρέφει default panels για το SongPageClient.
 */
function readSongToggleDefaultsFromProfile(profile: any, hasChords: boolean) {
  const prefs =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? (profile.prefs ?? {})
      : {};

  const songTogglesDefault =
    prefs && typeof prefs === "object" && !Array.isArray(prefs)
      ? (prefs.songTogglesDefault ?? {})
      : {};

  const defInfo = typeof songTogglesDefault.info === "boolean" ? songTogglesDefault.info : true;

  const defChordsRaw =
    typeof songTogglesDefault.chords === "boolean" ? songTogglesDefault.chords : true;

  const defTonicities =
    typeof songTogglesDefault.tonicities === "boolean" ? songTogglesDefault.tonicities : true;

  const defScores =
    typeof songTogglesDefault.scores === "boolean" ? songTogglesDefault.scores : false;

  return {
    info: defInfo,
    chords: Boolean(defChordsRaw && hasChords),
    singerTunes: defTonicities, // tonicities -> singerTunes
    scores: defScores,
  };
}

/**
 * Διαβάζει prefs.songsRedirectDefault από user.profile.
 */
function readSongsRedirectDefaultFromProfile(profile: any): RedirectDefault {
  const prefs =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? (profile.prefs ?? {})
      : {};

  const v = (prefs as any)?.songsRedirectDefault;

  return v === "TITLE" || v === "CHORDS" || v === "LYRICS" || v === "SCORE" ? v : "TITLE";
}

export default async function SongPage({ params }: SongPageProps) {
  const songId = Number(params.id);

  if (!songId || Number.isNaN(songId)) {
    return (
      <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
        <p>Μη έγκυρο ID τραγουδιού.</p>
      </section>
    );
  }

  let rawSong: any;
  try {
    rawSong = await fetchJson<any>(`/songs/${songId}`);
  } catch {
    return (
      <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
        <p>Σφάλμα κατά την φόρτωση του τραγουδιού.</p>
      </section>
    );
  }

  const versions = normalizeVersions(rawSong.versions);
  const tags = normalizeTags(rawSong.tags);

  const hasScore = Boolean(rawSong.hasScore);
  const scoreFile: string | null = rawSong.scoreFile ? String(rawSong.scoreFile) : null;

  const song: SongDetail = {
    id: Number(rawSong.id),
    title: String(rawSong.title ?? ""),
    firstLyrics: rawSong.firstLyrics ?? rawSong.first_lyrics ?? null,
    lyrics: rawSong.lyrics ?? null,
    characteristics: rawSong.characteristics ?? null,
    originalKey: rawSong.originalKey ?? rawSong.original_key ?? null,
    originalKeySign: (() => {
      const v = rawSong.originalKeySign ?? rawSong.original_key_sign ?? null;
      return v === "+" || v === "-" ? v : null;
    })(),
    chords: rawSong.chords ?? null,
    status: rawSong.status ?? null,

    categoryId: rawSong.categoryId ?? rawSong.category_id ?? null,
    rythmId: rawSong.rythmId ?? rawSong.rythm_id ?? rawSong.rhythmId ?? rawSong.rhythm_id ?? null,
    makamId: rawSong.makamId ?? rawSong.makam_id ?? null,

    categoryTitle: rawSong.categoryTitle ?? rawSong.category_title ?? null,
    composerName: rawSong.composerName ?? rawSong.composer_name ?? null,
    lyricistName: rawSong.lyricistName ?? rawSong.lyricist_name ?? null,
    rythmTitle:
      rawSong.rythmTitle ??
      rawSong.rythm_title ??
      rawSong.rhythmTitle ??
      rawSong.rhythm_title ??
      null,
    basedOnSongId: rawSong.basedOnSongId ?? rawSong.based_on_song_id ?? null,
    basedOnSongTitle: rawSong.basedOnSongTitle ?? rawSong.based_on_song_title ?? null,
    views: typeof rawSong.views === "number" ? rawSong.views : Number(rawSong.views ?? 0) || 0,

    createdByUserId:
      rawSong.createdByUserId ??
      rawSong.createdById ??
      rawSong.created_by_user_id ??
      rawSong.created_by_id ??
      null,

    createdByDisplayName:
      rawSong.createdByDisplayName ??
      rawSong.created_by_display_name ??
      rawSong.createdByName ??
      rawSong.created_by_name ??
      null,

    tags,
    hasScore,
    scoreFile,
    versions,
  };

  // ✅ ΜΟΝΟ ΕΔΩ hasChords (όχι δεύτερο)
  const hasChords = Boolean(song.chords && song.chords.trim() !== "");

  // τρέχων χρήστης (με profile πλέον)
  const currentUser = await getCurrentUserFromApi().catch(() => null);

  const isOwner =
    !!currentUser &&
    typeof currentUser.id === "number" &&
    song.createdByUserId != null &&
    currentUser.id === song.createdByUserId;

  const canEdit = Boolean(isPrivilegedRole(currentUser?.role) || isOwner);

  const isOrganic = song.characteristics?.split(",").some((c) => c.trim() === "Οργανικό") ?? false;
  const finalLyrics =
    isOrganic
      ? "(Οργανικό)"
      : !song.lyrics || song.lyrics.trim() === ""
        ? "(Χωρίς διαθέσιμους στίχους)"
        : song.lyrics;

  const firstWords = getFirstWordsForYoutube(song.firstLyrics, song.lyrics);
  const youtubeSearchQuery = `${song.title} ${firstWords}`.trim();
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    youtubeSearchQuery,
  )}`;

  const scoreFileUrl =
    song.hasScore && song.scoreFile
      ? `/api/scores/${encodeURIComponent(song.scoreFile)}`
      : `/api/scores/${song.id}`;

  // ✅ defaults από profile (αν υπάρχει)
  const defaultPanelsOpen = currentUser?.profile
    ? readSongToggleDefaultsFromProfile(currentUser.profile, hasChords)
    : { info: true, singerTunes: true, chords: hasChords, scores: true };

  // ✅ redirect default από profile (αν υπάρχει)
  const redirectDefault = currentUser?.profile
    ? readSongsRedirectDefaultFromProfile(currentUser.profile)
    : ("TITLE" as const);

  return (
    <SongPageClient
      song={song}
      canEdit={canEdit}
      finalLyrics={finalLyrics}
      youtubeUrl={youtubeUrl}
      scoreFileUrl={scoreFileUrl}
      schemaNode={renderSongSchema(song)}
      defaultPanelsOpen={defaultPanelsOpen}
      redirectDefault={redirectDefault}
    />
  );
}
