// apps/web/app/songs/[id]/edit/SongEditForm.tsx
import Link from "next/link";

import TagsEditorClient, { type TagDto } from "./TagsEditorClient";
import DiscographiesEditorClient from "./DiscographiesEditorClient";
import SongCreditsEditorClient from "./SongCreditsEditorClient";

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

export type SongForEdit = {
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

export type SongCreditsDto = {
  composerArtistIds: number[];
  lyricistArtistIds: number[];
};

export type CategoryOption = { id: number; title: string };
export type RythmOption = { id: number; title: string };

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

function deriveFirstLyricsFromLyrics(lyrics: string | null | undefined): string {
  const text = (lyrics ?? "").toString();
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t) return t.length > 300 ? t.slice(0, 300) : t;
  }
  return "";
}

type Props = {
  song: SongForEdit;
  credits: SongCreditsDto;
  categories: CategoryOption[];
  rythms: RythmOption[];

  isOwner: boolean;
  currentUserRoleLabel: string;
  apiBase: string;

  createMode?: boolean; // ✅ NEW
};


export default function SongEditForm({
  song,
  credits,
  categories,
  rythms,
  createMode, 
  isOwner,
  currentUserRoleLabel,
  apiBase,
}: Props) {
  const isCreate = !!createMode;
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
  const formAction = isCreate ? "/api/songs" : `/api/songs/${song.id}`;
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
            <span className="song-edit-breadcrumb-current">
              {isCreate ? "Νέο τραγούδι" : "Επεξεργασία"}
            </span>

          </p>

          <h1 className="song-edit-title">
            {isCreate ? "Δημιουργία νέου τραγουδιού" : `Επεξεργασία τραγουδιού ${song.title}`}
          </h1>


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
                Δικαιώματα: <strong>{isOwner ? "Owner" : currentUserRoleLabel}</strong>
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
         
       
        <form method="POST" action={formAction} className="song-edit-form">

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

          {/* TODO: ΕΔΩ κάνε paste αυτούσιο το “υπόλοιπο” που έχεις στο παλιό page.tsx
              (assets, status, category, rythm, script κλπ) — δεν μου το έστειλες στο μήνυμα. */}

          <footer className="song-edit-actions">
           <button type="submit" className="song-edit-submit">
              {isCreate ? "Δημιουργία τραγουδιού" : "Αποθήκευση αλλαγών"}
            </button>

            <Link href={isCreate ? "/songs" : `/songs/${song.id}`} className="song-edit-cancel">
              Άκυρο
            </Link>

          </footer>
        </form>
      </section>
    </main>
  );
}
