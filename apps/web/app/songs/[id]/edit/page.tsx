import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

import TagsEditorClient, { type TagDto } from "./TagsEditorClient";
import DiscographiesEditorClient from "./DiscographiesEditorClient";
import SongCreditsEditorClient from "./SongCreditsEditorClient";

export const dynamic = "force-dynamic";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

type SongAssetDto = {
  id: number;
  kind: "LINK" | "FILE";
  type: string;
  title: string | null;
  url: string | null;
  filePath: string | null;
  mimeType: string | null;
  sizeBytes: string | null;

  label: string | null;
  sort: number;
  isPrimary: boolean;
};

type SongVersionDto = {
  id: number;
  year: number | null;
  singerFront: string | null;
  singerBack: string | null;
  solist: string | null;
  youtubeSearch: string | null;

  singerFrontIds: number[] | null;
  singerBackIds: number[] | null;
  solistIds: number[] | null;
};

type SongForEdit = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;

  // ✅ legacy strings (fallback)
  composerName?: string | null;
  lyricistName?: string | null;

  tags: TagDto[];
  assets: SongAssetDto[];
  characteristics: string | null;

  originalKey: string | null;
  chords: string | null;
  status: string | null;

  categoryId: number | null;
  rythmId: number | null;

  createdByUserId: number | null;

  hasScore: boolean;
  scoreFile: string | null;

  legacySongId?: number | null;

  versions: SongVersionDto[];
};

type SongCreditsDto = {
  composerArtistIds: number[];
  lyricistArtistIds: number[];
};

type CategoryOption = { id: number; title: string };
type RythmOption = { id: number; title: string };

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

// ✅ split legacy names -> string[]
function splitNames(v: string | null | undefined): string[] {
  const s = (v ?? "").toString().trim();
  if (!s) return [];
  // split μόνο σε κόμμα ή slash (χωρίς “μαγικά”)
  return s
    .split(/[,/]/g)
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean);
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

function deriveFirstLyricsFromLyrics(lyrics: string | null | undefined): string {
  const text = (lyrics ?? "").toString();
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t) return t.length > 300 ? t.slice(0, 300) : t;
  }
  return "";
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

  const statusValue = song.status ?? "PENDING_APPROVAL";
  const scoreUrl = song.hasScore && song.scoreFile ? `/scores/${song.scoreFile}` : null;

  const firstLyricsDerived = deriveFirstLyricsFromLyrics(song.lyrics);
  const initialTagIds = song.tags.map((t) => t.id);
  const initialAssets = song.assets;
  const initialVersions = song.versions;

  const initialComposerArtistIds = credits.composerArtistIds;
  const initialLyricistArtistIds = credits.lyricistArtistIds;

  // ✅ fallback names από legacy song fields
  const initialComposerNames = splitNames(song.composerName ?? null);
  const initialLyricistNames = splitNames(song.lyricistName ?? null);

  const apiBase = API_BASE_URL;

  return (
    <main className="song-edit-page">
      {/* ✅ ΣΤΥΛ: άσπρο φόντο + μαύρα γράμματα για Τίτλο/Στίχους/Συγχορδίες */}
      <style>{`
        .song-edit-input-light {
          background: #fff !important;
          color: #000 !important;
          border: 1px solid #ccc !important;
          caret-color: #000 !important;
        }
        .song-edit-input-light::placeholder {
          color: rgba(0,0,0,0.55) !important;
        }
      `}</style>

      <section className="song-edit-wrapper">
        <header className="song-edit-header">
          <p className="song-edit-breadcrumb">
            <Link href="/songs" className="song-edit-breadcrumb-link">
              Τραγούδια
            </Link>
            <span className="song-edit-breadcrumb-separator">/</span>
            <Link href={`/songs/${song.id}`} className="song-edit-breadcrumb-link">
              #{song.id}
            </Link>
            <span className="song-edit-breadcrumb-separator">/</span>
            <span className="song-edit-breadcrumb-current">Επεξεργασία</span>
          </p>

          <h1 className="song-edit-title">Επεξεργασία τραγουδιού {song.title}</h1>

          <div className="song-edit-meta" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "#111",
                }}
              >
                Δικαιώματα: <strong>{isOwner ? "Owner" : String(currentUser.role)}</strong>
              </span>

              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "#111",
                }}
              >
                Παρτιτούρα: <strong>{song.hasScore ? "Ναι" : "Όχι"}</strong>
                {scoreUrl && (
                  <>
                    {" "}
                    —{" "}
                    <a
                      href={scoreUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "underline" }}
                    >
                      {song.scoreFile}
                    </a>
                  </>
                )}
              </span>
            </div>
          </div>
        </header>

        <form method="POST" action={`/api/songs/${song.id}`} className="song-edit-form">
          <input
            type="hidden"
            id="tagIdsJson"
            name="tagIdsJson"
            defaultValue={JSON.stringify(initialTagIds)}
          />
          <input
            type="hidden"
            id="assetsJson"
            name="assetsJson"
            defaultValue={JSON.stringify(initialAssets)}
          />
          <input
            type="hidden"
            id="versionsJson"
            name="versionsJson"
            defaultValue={JSON.stringify(initialVersions)}
          />

          {/* ΣΗΜΕΙΩΣΗ: κρατάμε τους υπολογισμούς για parity, παρότι δεν φαίνονται εδώ */}
          {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
          <input type="hidden" name="__firstLyricsDerived" value={firstLyricsDerived} readOnly />
          {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
          <input type="hidden" name="__statusValue" value={statusValue} readOnly />

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Βασικές πληροφορίες</h2>

            <div className="song-edit-field">
              <label htmlFor="title">Τίτλος *</label>
              <input
                type="text"
                id="title"
                name="title"
                defaultValue={song.title}
                required
                className="song-edit-input-light"
              />
            </div>

            <div className="song-edit-field">
              <label htmlFor="lyrics">Στίχοι (πλήρες κείμενο)</label>
              <textarea
                id="lyrics"
                name="lyrics"
                rows={10}
                defaultValue={song.lyrics ?? ""}
                className="song-edit-input-light"
              />
            </div>

            <div className="song-edit-field">
              <label htmlFor="chords">Συγχορδίες</label>
              <textarea
                id="chords"
                name="chords"
                rows={6}
                defaultValue={song.chords ?? ""}
                className="song-edit-input-light"
              />
            </div>
          </div>

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Tags</h2>

            <TagsEditorClient
              apiBaseUrl={apiBase}
              initialTags={song.tags}
              hiddenInputId="tagIdsJson"
              take={25}
            />
          </div>

          {/* ✅ Credits ΠΑΝΩ από Discographies */}
          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Συντελεστές</h2>

            <SongCreditsEditorClient
              initialComposerArtistIds={initialComposerArtistIds}
              initialLyricistArtistIds={initialLyricistArtistIds}
              initialComposerNames={initialComposerNames}
              initialLyricistNames={initialLyricistNames}
              hiddenInputName="creditsJson"
            />
          </div>

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Δισκογραφίες</h2>

            <DiscographiesEditorClient
              songTitle={song.title}
              initialVersions={initialVersions}
              hiddenInputId="versionsJson"
            />
          </div>
                        {/* ✅ Κατηγορία / Ρυθμός */}
          <div className="song-edit-section song-edit-grid">
            <div className="song-edit-field">
              <label htmlFor="categoryId">Κατηγορία</label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={song.categoryId != null ? String(song.categoryId) : ""}
                className="song-edit-input-light"
              >
                <option value="">(Χωρίς κατηγορία)</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="song-edit-field">
              <label htmlFor="rythmId">Ρυθμός</label>
              <select
                id="rythmId"
                name="rythmId"
                defaultValue={song.rythmId != null ? String(song.rythmId) : ""}
                className="song-edit-input-light"
              >
                <option value="">(Χωρίς ρυθμό)</option>
                {rythms.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
  
          {/* (όλο το υπόλοιπο σου μένει ίδιο: assets, status, category, rythm, script κλπ) */}

          <footer className="song-edit-actions">
            <button type="submit" className="song-edit-submit">
              Αποθήκευση αλλαγών
            </button>
            <Link href={`/songs/${song.id}`} className="song-edit-cancel">
              Άκυρο
            </Link>
          </footer>
        </form>
      </section>
    </main>
  );
}
