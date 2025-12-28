// app/songs/[id]/page.tsx
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

import SongChordsClient from "./SongChordsClient";
import SongInfoToggle from "./SongInfoToggle";
import ScorePlayerClient from "./score/ScorePlayerClient";
import SongSendToRoomButton from "./SongSendToRoomButton";

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

type SongDetail = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;
  characteristics: string | null;
  originalKey: string | null;
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

  // ✅ tags
  tags: TagDto[];

  // ✅ score
  hasScore: boolean;
  scoreFile: string | null;

  versions: SongVersion[];
};

type SongPageProps = {
  params: {
    id: string;
  };
};

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

/**
 * Καθαρίζει text τιμές: "" / "NULL" / "null" / "undefined" => null
 */
function cleanText(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return cleanText(String(v));
  const s = v.trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "NULL" || u === "UNDEFINED" || u === "N/A") return null;
  return s;
}

/** Πάρε το πρώτο “μη-άδειο” text από πολλά candidates */
function pickText(...candidates: any[]): string | null {
  for (const c of candidates) {
    const x = cleanText(c);
    if (x) return x;
  }
  return null;
}

/**
 * Normalisation ΔΙΣΚΟΓΡΑΦΙΑΣ – δέχεται τόσο camelCase όσο και snake_case,
 * και ΔΕΝ “κολλάει” σε κενά strings.
 */
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

// Schema.org MusicComposition (αντίστοιχο generate_song_schema)
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

// Δυναμικός τίτλος σελίδας (σαν το παλιό wp_title / meta)
export async function generateMetadata({ params }: SongPageProps) {
  const songId = Number(params.id);
  if (!songId || Number.isNaN(songId)) {
    return { title: "Μη έγκυρο τραγούδι | Repertorio Next" };
  }

  let song: any = null;
  try {
    // noIncrement=1 → ΔΕΝ αυξάνουμε views από το metadata fetch
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
    alternates: {
      canonical: `https://repertorio.net/songs/song/${songId}-${slugify(title)}/`,
    },
  };
}

const EDIT_ROLES: UserRole[] = ["ADMIN", "EDITOR", "AUTHOR"];

function isPrivilegedRole(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return EDIT_ROLES.includes(role);
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

  // ------- ΦΟΡΤΩΣΗ ΤΡΑΓΟΥΔΙΟΥ ΑΠΟ API --------
  let rawSong: any;
  try {
    // Εδώ ΘΕΛΟΥΜΕ να αυξηθεί ο μετρητής views
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
    chords: rawSong.chords ?? null,
    status: rawSong.status ?? null,

    categoryId: rawSong.categoryId ?? rawSong.category_id ?? null,
    rythmId: rawSong.rythmId ?? rawSong.rythm_id ?? rawSong.rhythmId ?? rawSong.rhythm_id ?? null,
    makamId: rawSong.makamId ?? rawSong.makam_id ?? null,

    categoryTitle: rawSong.categoryTitle ?? rawSong.category_title ?? null,
    composerName: rawSong.composerName ?? rawSong.composer_name ?? null,
    lyricistName: rawSong.lyricistName ?? rawSong.lyricist_name ?? null,
    rythmTitle: rawSong.rythmTitle ?? rawSong.rythm_title ?? rawSong.rhythmTitle ?? rawSong.rhythm_title ?? null,
    basedOnSongId: rawSong.basedOnSongId ?? rawSong.based_on_song_id ?? null,
    basedOnSongTitle: rawSong.basedOnSongTitle ?? rawSong.based_on_song_title ?? null,
    views: typeof rawSong.views === "number" ? rawSong.views : Number(rawSong.views ?? 0) || 0,

    createdByUserId: rawSong.createdByUserId ?? rawSong.created_by_user_id ?? null,

    tags,
    hasScore,
    scoreFile,

    versions,
  };

  // ------- ΦΟΡΡΤΩΣΗ ΤΡΕΧΟΝΤΟΣ ΧΡΗΣΤΗ ΓΙΑ ΔΙΚΑΙΩΜΑ ΕΠΕΞΕΡΓΑΣΙΑΣ --------
  let currentUser: any = null;
  try {
    currentUser = await getCurrentUserFromApi();
  } catch {
    currentUser = null;
  }

  const isOwner =
    currentUser &&
    typeof currentUser.id === "number" &&
    song.createdByUserId != null &&
    currentUser.id === song.createdByUserId;

  const canEdit = Boolean(isPrivilegedRole(currentUser?.role) || isOwner);

  // Λογική "Οργανικό" / "Χωρίς στίχους"
  const isOrganic =
    song.characteristics?.split(",").some((c) => c.trim() === "Οργανικό") ?? false;

  const finalLyrics =
    isOrganic ? "(Οργανικό)" : !song.lyrics || song.lyrics.trim() === "" ? "(Χωρίς διαθέσιμους στίχους)" : song.lyrics;

  const firstWords = getFirstWordsForYoutube(song.firstLyrics, song.lyrics);
  const youtubeSearchQuery = `${song.title} ${firstWords}`.trim();
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeSearchQuery)}`;

  // ✅ Score URL: προτεραιότητα στο scoreFile από API
  const scoreFileUrl =
    song.hasScore && song.scoreFile
      ? `/scores/${song.scoreFile}`
      : `/scores/${song.id}.mxl`; // fallback μόνο

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      {/* Κουμπιά πάνω δεξιά */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
        {canEdit && (
          <Link
            href={`/songs/${song.id}/edit`}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #555",
              background: "#222",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
            }}
            title="Επεξεργασία τραγουδιού"
          >
            ✏️ Επεξεργασία
          </Link>
        )}

        <SongSendToRoomButton songId={song.id} title={song.title} />

        <a
          href={`/songs/${song.id}/score`}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
          title="Προβολή παρτιτούρας σε νέο παράθυρο"
        >
          📄 Παρτιτούρα
        </a>

        <a
          href={youtubeUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #c00",
            background: "#c00",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
          title="Αναζήτηση στο YouTube"
        >
          ▶ YouTube
        </a>
      </div>

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>{song.title}</h1>

        {/* ✅ Tags εμφάνιση */}
        {song.tags.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {song.tags.map((t) => (
              <span
                key={t.id}
                style={{
                  border: "1px solid #444",
                  borderRadius: 999,
                  padding: "4px 10px",
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "center",
                  background: "#0f0f0f",
                }}
                title={t.slug ? `slug: ${t.slug}` : undefined}
              >
                #{t.title}
              </span>
            ))}
          </div>
        )}
      </header>

      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, #444, transparent)",
          marginBottom: 16,
        }}
      />

      <SongInfoToggle
        songTitle={song.title}
        categoryTitle={song.categoryTitle}
        composerName={song.composerName}
        lyricistName={song.lyricistName}
        rythmTitle={song.rythmTitle}
        basedOnSongTitle={song.basedOnSongTitle}
        basedOnSongId={song.basedOnSongId}
        characteristics={song.characteristics}
        views={song.views}
        status={song.status}
        versions={song.versions}
      />

      {song.chords && song.chords.trim() !== "" && (
        <SongChordsClient chords={song.chords} originalKey={song.originalKey} />
      )}

      <section style={{ marginTop: 24, marginBottom: 32 }}>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            backgroundColor: "#111",
            padding: "16px",
            borderRadius: 8,
            border: "1px solid #333",
            lineHeight: 1.6,
            fontFamily: "inherit",
            fontSize: "1rem",
          }}
        >
          {finalLyrics}
        </pre>
      </section>

      <section id="score-section" style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: 12 }}>Παρτιτούρα</h2>

        {/* ✅ Αν δεν υπάρχει score, δεν “σκάμε” με broken player */}
        {song.hasScore ? (
          <ScorePlayerClient fileUrl={scoreFileUrl} title={song.title} />
        ) : (
          <div
            style={{
              border: "1px solid #333",
              borderRadius: 8,
              padding: 12,
              background: "#111",
              opacity: 0.9,
            }}
          >
            Δεν υπάρχει παρτιτούρα για αυτό το τραγούδι.
          </div>
        )}
      </section>

      {renderSongSchema(song)}
    </section>
  );
}
