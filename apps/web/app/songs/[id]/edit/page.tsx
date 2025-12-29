// app/songs/[id]/edit/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

import TagsEditorClient, { type TagDto } from "./TagsEditorClient";
import DiscographiesEditorClient from "./DiscographiesEditorClient";

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

  // ✅ ADD αυτά
  singerFrontIds: number[] | null;
  singerBackIds: number[] | null;
  solistIds: number[] | null;
};

type SongForEdit = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;

  tags: TagDto[];
  assets: SongAssetDto[];

  originalKey: string | null;
  chords: string | null;
  status: string | null;

  categoryId: number | null;
  rythmId: number | null;

  createdByUserId: number | null;

  hasScore: boolean;
  scoreFile: string | null;

  legacySongId?: number | null;

  // ✅ NEW
  versions: SongVersionDto[];
};

type CategoryOption = { id: number; title: string };
type RythmOption = { id: number; title: string };

async function fetchSong(id: number): Promise<SongForEdit> {
  const s = await fetchJson<any>(`/songs/${id}?noIncrement=1`);

  return {
    id: Number(s.id),
    title: String(s.title ?? ""),
    firstLyrics: s.firstLyrics ?? null,
    lyrics: s.lyrics ?? null,

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

    // ✅ NEW
    versions: Array.isArray(s.versions)
      ? s.versions.map((v: any) => ({
          id: Number(v.id),
          year: typeof v.year === "number" ? v.year : null,
          singerFront: v.singerFront ?? null,
          singerBack: v.singerBack ?? null,
          solist: v.solist ?? null,
          youtubeSearch: v.youtubeSearch ?? null,

          // ✅ ADD αυτά (όπως τα δίνει το API)
          singerFrontIds: Array.isArray(v.singerFrontIds) ? v.singerFrontIds.map(Number) : [],
          singerBackIds: Array.isArray(v.singerBackIds) ? v.singerBackIds.map(Number) : [],
          solistIds: Array.isArray(v.solistIds) ? v.solistIds.map(Number) : [],
        }))
      : [],
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

  const [song, currentUser, categories, rythms] = await Promise.all([
    fetchSong(songId),
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

  // ✅ NEW
  const initialVersions = song.versions;

  const apiBase = API_BASE_URL;

  return (
    <main className="song-edit-page">
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

          <h1 className="song-edit-title">Επεξεργασία τραγουδιού #{song.id}</h1>

          <p className="song-edit-subtitle">
            Τρέχων τίτλος:&nbsp;<strong>{song.title}</strong>
          </p>

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

              {song.legacySongId != null && (
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "#111",
                  }}
                >
                  legacySongId: <strong>{song.legacySongId}</strong>
                </span>
              )}

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
          {/* contract με route.ts */}
          <input
            type="hidden"
            id="tagIdsJson"
            name="tagIdsJson"
            defaultValue={JSON.stringify(initialTagIds)}
          />
          <input type="hidden" id="assetsJson" name="assetsJson" defaultValue={JSON.stringify(initialAssets)} />

          {/* ✅ NEW */}
          <input
            type="hidden"
            id="versionsJson"
            name="versionsJson"
            defaultValue={JSON.stringify(initialVersions)}
          />

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Βασικές πληροφορίες</h2>

            <div className="song-edit-field">
              <label htmlFor="title">Τίτλος *</label>
              <input type="text" id="title" name="title" defaultValue={song.title} required />
            </div>

            <div className="song-edit-field">
              <label htmlFor="firstLyrics">Πρώτοι στίχοι</label>
              <input
                type="text"
                id="firstLyrics"
                name="firstLyrics"
                placeholder="Παράγεται αυτόματα από την 1η γραμμή των στίχων"
                defaultValue={firstLyricsDerived}
                readOnly
              />
              <small style={{ opacity: 0.8 }}>
                Αυτό το πεδίο ενημερώνεται αυτόματα από την πρώτη (μη-κενή) γραμμή του πεδίου “Στίχοι”.
              </small>
            </div>

            <div className="song-edit-field">
              <label htmlFor="lyrics">Στίχοι (πλήρες κείμενο)</label>
              <textarea id="lyrics" name="lyrics" rows={10} defaultValue={song.lyrics ?? ""} />
            </div>
          </div>

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Συγχορδίες</h2>

            <div className="song-edit-field">
              <label htmlFor="chords">Συγχορδίες</label>
              <textarea id="chords" name="chords" rows={8} defaultValue={song.chords ?? ""} />
            </div>
          </div>

          {/* ✅ TAGS (Client Component) */}
          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Tags</h2>
            <TagsEditorClient apiBaseUrl={apiBase} initialTags={song.tags} hiddenInputId="tagIdsJson" take={25} />
          </div>

          {/* ✅ NEW: ΔΙΣΚΟΓΡΑΦΙΕΣ */}
          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Δισκογραφίες</h2>
            <DiscographiesEditorClient songTitle={song.title} initialVersions={song.versions} hiddenInputId="versionsJson" />
          </div>

          {/* ✅ ASSETS */}
          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Assets (Links / Files)</h2>

            <div
              id="assetsBox"
              style={{ border: "1px solid #333", borderRadius: 10, padding: 12, background: "#0f0f0f" }}
            >
              {song.assets.length === 0 ? (
                <p style={{ opacity: 0.85, marginTop: 0 }}>Δεν υπάρχουν assets.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {song.assets.map((a) => (
                    <div
                      key={a.id}
                      data-asset-id={a.id}
                      style={{
                        border: "1px solid #444",
                        borderRadius: 10,
                        padding: 10,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <strong>
                          #{a.id} {a.kind}/{a.type}
                        </strong>
                        {a.isPrimary && (
                          <span
                            style={{
                              border: "1px solid #555",
                              borderRadius: 999,
                              padding: "2px 8px",
                              opacity: 0.9,
                            }}
                          >
                            primary
                          </span>
                        )}
                        <button
                          type="button"
                          data-action="remove-asset"
                          data-asset-id={a.id}
                          style={{
                            marginLeft: "auto",
                            border: "1px solid #555",
                            borderRadius: 8,
                            background: "transparent",
                            cursor: "pointer",
                            padding: "4px 10px",
                          }}
                        >
                          Αφαίρεση
                        </button>
                      </div>

                      {a.title && <div>Τίτλος: {a.title}</div>}
                      {a.label && <div>Label: {a.label}</div>}
                      {a.url && (
                        <div>
                          URL:{" "}
                          <a href={a.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                            {a.url}
                          </a>
                        </div>
                      )}
                      {a.filePath && <div>File: {a.filePath}</div>}
                      <div style={{ opacity: 0.8 }}>Sort: {a.sort}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12, borderTop: "1px solid #333", paddingTop: 12 }}>
                <p style={{ marginTop: 0, fontWeight: 600 }}>Προσθήκη Asset</p>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    Kind
                    <select id="newAssetKind" defaultValue="LINK">
                      <option value="LINK">LINK</option>
                      <option value="FILE">FILE</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    Type
                    <select id="newAssetType" defaultValue="GENERIC">
                      <option value="GENERIC">GENERIC</option>
                      <option value="YOUTUBE">YOUTUBE</option>
                      <option value="SPOTIFY">SPOTIFY</option>
                      <option value="PDF">PDF</option>
                      <option value="AUDIO">AUDIO</option>
                      <option value="IMAGE">IMAGE</option>
                      <option value="SCORE">SCORE</option>
                    </select>
                  </label>

                  <input id="newAssetTitle" placeholder="Title (optional)" />
                  <input id="newAssetLabel" placeholder="Label (optional)" />
                  <input id="newAssetUrl" placeholder="URL (για LINK)" style={{ minWidth: 320 }} />
                  <input id="newAssetFilePath" placeholder="FilePath (για FILE)" style={{ minWidth: 260 }} />

                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    Primary
                    <input id="newAssetPrimary" type="checkbox" />
                  </label>

                  <button type="button" data-action="add-asset">
                    Προσθήκη asset
                  </button>
                </div>

                <small style={{ opacity: 0.8 }}>
                  Στέλνονται assets JSON στο <code>assetsJson</code>.
                </small>
              </div>
            </div>
          </div>

          <div className="song-edit-section song-edit-grid">
            <div className="song-edit-field">
              <label htmlFor="originalKey">Αρχικός τόνος</label>
              <input type="text" id="originalKey" name="originalKey" defaultValue={song.originalKey ?? ""} />
            </div>

            <div className="song-edit-field">
              <label htmlFor="status">Κατάσταση</label>
              <select id="status" name="status" defaultValue={statusValue}>
                <option value="DRAFT">Πρόχειρο</option>
                <option value="PENDING_APPROVAL">Σε αναμονή έγκρισης</option>
                <option value="PUBLISHED">Δημοσιευμένο</option>
                <option value="ARCHIVED">Αρχειοθετημένο</option>
              </select>
            </div>

            <div className="song-edit-field">
              <label htmlFor="categoryId">Κατηγορία</label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={song.categoryId != null ? String(song.categoryId) : ""}
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
              <select id="rythmId" name="rythmId" defaultValue={song.rythmId != null ? String(song.rythmId) : ""}>
                <option value="">(Χωρίς ρυθμό)</option>
                {rythms.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Παρτιτούρα (read-only)</h2>
            {song.hasScore && scoreUrl ? (
              <p style={{ marginTop: 8 }}>
                Υπάρχει παρτιτούρα:{" "}
                <a href={scoreUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                  {song.scoreFile}
                </a>
              </p>
            ) : (
              <p style={{ marginTop: 8, opacity: 0.85 }}>Δεν υπάρχει παρτιτούρα για αυτό το τραγούδι.</p>
            )}
          </div>

          <footer className="song-edit-actions">
            <button type="submit" className="song-edit-submit">
              Αποθήκευση αλλαγών
            </button>
            <Link href={`/songs/${song.id}`} className="song-edit-cancel">
              Άκυρο
            </Link>
          </footer>

          {/* ✅ ΜΟΝΟ firstLyrics + assets script. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
(function() {
  function parseJsonSafe(s, fallback) {
    try { return JSON.parse(s); } catch(e) { return fallback; }
  }

  function deriveFirstLyrics(text) {
    var t = (text || '').toString();
    var lines = t.replace(/\\r\\n/g,'\\n').replace(/\\r/g,'\\n').split('\\n');
    for (var i=0; i<lines.length; i++) {
      var s = (lines[i] || '').trim();
      if (s) return s.length > 300 ? s.slice(0,300) : s;
    }
    return '';
  }

  function syncFirstLyrics() {
    var lyricsEl = document.getElementById('lyrics');
    var firstEl = document.getElementById('firstLyrics');
    if (!lyricsEl || !firstEl) return;
    firstEl.value = deriveFirstLyrics(lyricsEl.value);
  }

  // ----- ASSETS -----
  function readAssets() {
    var el = document.getElementById('assetsJson');
    if (!el) return [];
    var arr = parseJsonSafe(el.value, []);
    if (!Array.isArray(arr)) return [];
    return arr;
  }

  function writeAssets(arr) {
    var el = document.getElementById('assetsJson');
    if (!el) return;
    el.value = JSON.stringify(arr);
  }

  function removeAssetById(assetId) {
    var arr = readAssets();
    var next = arr.filter(function(a){ return Number(a && a.id) !== Number(assetId); });
    writeAssets(next);
    var card = document.querySelector('[data-asset-id="' + assetId + '"]');
    if (card) card.style.display = 'none';
  }

  function addAssetFromInputs() {
    var kindEl = document.getElementById('newAssetKind');
    var typeEl = document.getElementById('newAssetType');
    var titleEl = document.getElementById('newAssetTitle');
    var labelEl = document.getElementById('newAssetLabel');
    var urlEl = document.getElementById('newAssetUrl');
    var fpEl = document.getElementById('newAssetFilePath');
    var primaryEl = document.getElementById('newAssetPrimary');

    if (!kindEl || !typeEl || !urlEl || !fpEl) return;

    var kind = String(kindEl.value || 'LINK');
    var type = String(typeEl.value || 'GENERIC');
    var title = titleEl ? (titleEl.value || '').trim() : '';
    var label = labelEl ? (labelEl.value || '').trim() : '';
    var url = (urlEl.value || '').trim();
    var filePath = (fpEl.value || '').trim();
    var isPrimary = primaryEl ? !!primaryEl.checked : false;

    if (kind === 'LINK' && !url) { alert('Για LINK απαιτείται URL'); return; }
    if (kind === 'FILE' && !filePath) { alert('Για FILE απαιτείται filePath'); return; }

    var arr = readAssets();
    var next = arr.slice();
    next.push({
      kind: kind,
      type: type,
      title: title || null,
      url: kind === 'LINK' ? url : null,
      filePath: kind === 'FILE' ? filePath : null,
      mimeType: null,
      sizeBytes: null,
      label: label || null,
      sort: (next.length + 1) * 10,
      isPrimary: isPrimary
    });

    writeAssets(next);
    alert('Το asset προστέθηκε. Θα φανεί μετά το save/reload.');

    if (titleEl) titleEl.value = '';
    if (labelEl) labelEl.value = '';
    urlEl.value = '';
    fpEl.value = '';
    if (primaryEl) primaryEl.checked = false;
  }

  function init() {
    syncFirstLyrics();

    var lyricsEl = document.getElementById('lyrics');
    var formEl = document.querySelector('form.song-edit-form');
    if (lyricsEl) {
      lyricsEl.addEventListener('input', syncFirstLyrics);
      lyricsEl.addEventListener('blur', syncFirstLyrics);
    }
    if (formEl) {
      formEl.addEventListener('submit', function(){ syncFirstLyrics(); });
    }

    document.addEventListener('click', function(e) {
      var el = e.target;
      if (!(el instanceof Element)) return;

      var actionEl = el.closest('[data-action]');
      if (!actionEl) return;

      var action = actionEl.getAttribute('data-action');

      if (action === 'remove-asset') {
        e.preventDefault();
        var aid = Number(actionEl.getAttribute('data-asset-id'));
        if (!Number.isFinite(aid)) return;
        removeAssetById(aid);
        return;
      }

      if (action === 'add-asset') {
        e.preventDefault();
        addAssetFromInputs();
        return;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
              `,
            }}
          />
        </form>
      </section>
    </main>
  );
}
