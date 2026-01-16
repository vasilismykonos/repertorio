// apps/web/app/songs/[id]/edit/SongEditForm.tsx
"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import DeleteSongButton from "./DeleteSongButton";
import TagsEditorClient, { type TagDto } from "./TagsEditorClient";
import DiscographiesEditorClient from "./DiscographiesEditorClient";
import SongCreditsEditorClient from "./SongCreditsEditorClient";
import CategoryRythmPickerClient from "./CategoryRythmPickerClient";

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

function splitNames(v: string | null | undefined): string[] {
  const s = (v ?? "").toString().trim();
  if (!s) return [];
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

  createMode?: boolean;
};

export default function SongEditForm({
  song,
  credits,
  categories,
  rythms,
  createMode,
  isOwner,
  currentUserRoleLabel,
}: Props) {
  const isCreate = !!createMode;
  const statusValue = song.status ?? "PENDING_APPROVAL";
  const scoreUrl =
    song.hasScore && song.scoreFile ? `/api/scores/${song.scoreFile}` : null;

  const firstLyricsDerived = deriveFirstLyricsFromLyrics(song.lyrics);

  const initialTagIds = song.tags.map((t) => t.id);
  const initialAssets = song.assets;
  const initialVersions = (song.versions ?? []).map((v) => ({
    ...v,
    singerFrontIds: v.singerFrontIds ?? [],
    singerBackIds: v.singerBackIds ?? [],
    solistIds: v.solistIds ?? [],
  }));

  const initialComposerArtistIds = credits.composerArtistIds;
  const initialLyricistArtistIds = credits.lyricistArtistIds;

  const initialComposerNames = splitNames(song.composerName ?? null);
  const initialLyricistNames = splitNames(song.lyricistName ?? null);

  const [isBusy, setIsBusy] = useState(false);
  const router = useRouter();

  function handleCancel() {
    if (isCreate) router.push("/songs");
    else router.push(`/songs/${song.id}`);
  }

  function requestSaveSubmit() {
    const form = document.getElementById("song-edit-form") as
      | HTMLFormElement
      | null;
    form?.requestSubmit();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy) return;
    setIsBusy(true);

    try {
      const formData = new FormData(e.currentTarget);

      const title = formData.get("title")?.toString() || "";
      const lyrics = (formData.get("lyrics") as string | null) ?? null;
      const chords = (formData.get("chords") as string | null) ?? null;

      const categoryRaw = formData.get("categoryId")?.toString() || "";
      const rythmRaw = formData.get("rythmId")?.toString() || "";
      const categoryId = categoryRaw ? Number(categoryRaw) : null;
      const rythmId = rythmRaw ? Number(rythmRaw) : null;

      const tagIdsJson = formData.get("tagIdsJson")?.toString() || "[]";
      const assetsJson = formData.get("assetsJson")?.toString() || "[]";
      const versionsJson = formData.get("versionsJson")?.toString() || "[]";
      const creditsJson = formData.get("creditsJson")?.toString() || "{}";

      let tagIds: number[] = [];
      let assets: any[] | null = null;
      let versions: any[] | null = null;
      let composerArtistIds: number[] = [];
      let lyricistArtistIds: number[] = [];

      try {
        tagIds = JSON.parse(tagIdsJson);
      } catch {
        tagIds = [];
      }
      try {
        assets = JSON.parse(assetsJson);
      } catch {
        assets = null;
      }
      try {
        versions = JSON.parse(versionsJson);
      } catch {
        versions = null;
      }
      try {
        const creditsObj = JSON.parse(creditsJson);
        if (Array.isArray(creditsObj?.composerArtistIds)) {
          composerArtistIds = creditsObj.composerArtistIds
            .map((x: any) => Number(x))
            .filter((n: any) => Number.isFinite(n) && n > 0);
        }
        if (Array.isArray(creditsObj?.lyricistArtistIds)) {
          lyricistArtistIds = creditsObj.lyricistArtistIds
            .map((x: any) => Number(x))
            .filter((n: any) => Number.isFinite(n) && n > 0);
        }
      } catch {
        composerArtistIds = [];
        lyricistArtistIds = [];
      }

      const firstLyrics = deriveFirstLyricsFromLyrics(lyrics);

      const body: any = {
        title: title || undefined,
        firstLyrics: firstLyrics ?? undefined,
        lyrics,
        characteristics: song.characteristics ?? null,
        originalKey: song.originalKey ?? null,
        chords,
        status: statusValue ?? undefined,
        categoryId,
        rythmId,
        tagIds,
        assets,
        versions,
        composerArtistIds,
        lyricistArtistIds,
      };

      const endpoint = isCreate
        ? "/api/songs/full"
        : `/api/songs/${song.id}/full`;
      const method = isCreate ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(
          `Αποτυχία αποθήκευσης τραγουδιού: HTTP ${res.status}${
            text ? "\n" + text : ""
          }`,
        );
        return;
      }

      if (isCreate) {
        let created: any = null;
        try {
          created = await res.json();
        } catch {
          created = null;
        }
        const newId = created?.id;
        router.push(newId ? `/songs/${newId}/edit` : "/songs");
      } else {
        router.push(`/songs/${song.id}`);
      }
    } catch (err) {
      console.error(err);
      alert("Αποτυχία αποθήκευσης τραγουδιού.");
    } finally {
      setIsBusy(false);
    }
  }

  const backHref = isCreate ? "/songs" : `/songs/${song.id}`;

  return (
    <main className="song-edit-page">
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
            <Link
              href={`/songs/${song.id}`}
              className="song-edit-breadcrumb-link"
            >
              #{song.id}
            </Link>
            <span className="song-edit-breadcrumb-separator">/</span>
            <span className="song-edit-breadcrumb-current">
              {isCreate ? "Νέο τραγούδι" : "Επεξεργασία"}
            </span>
          </p>

          <h1 className="song-edit-title">
            {isCreate
              ? "Δημιουργία νέου τραγουδιού"
              : `Επεξεργασία τραγουδιού ${song.title}`}
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
                Δικαιώματα:{" "}
                <strong>{isOwner ? "Owner" : currentUserRoleLabel}</strong>
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

        <ActionBar
          left={
            <>
              {A.backLink({
                href: backHref,
                label: "Πίσω",
              })}
            </>
          }
          right={
            <>
              {A.save({
                onClick: requestSaveSubmit,
                disabled: isBusy,
                loading: isBusy,
                label: isCreate ? "Δημιουργία" : "Αποθήκευση αλλαγών",
                loadingLabel: isCreate ? "Δημιουργία..." : "Αποθήκευση...",
              })}
              {A.cancel({
                onClick: handleCancel,
                disabled: isBusy,
              })}

              {!isCreate && (
                <DeleteSongButton songId={song.id} songTitle={song.title} />
              )}
            </>
          }
        />

        <form id="song-edit-form" onSubmit={handleSubmit} className="song-edit-form">
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

          <input
            type="hidden"
            name="__firstLyricsDerived"
            value={firstLyricsDerived}
            readOnly
          />
          <input
            type="hidden"
            name="__statusValue"
            value={statusValue}
            readOnly
          />

          {/* 1) Βασικές πληροφορίες */}
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

          {/* ✅ Ζητούμενο: Κατηγορία/Ρυθμός κάτω από συγχορδίες */}
          <CategoryRythmPickerClient
            initialCategoryId={song.categoryId}
            initialRythmId={song.rythmId}
            categories={categories}
            rythms={rythms}
          />

          {/* 2) Συντελεστές */}
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

          {/* ✅ Ζητούμενο: Tags κάτω από τους Συντελεστές */}
          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Tags</h2>
            <TagsEditorClient
              initialTags={song.tags}
              hiddenInputId="tagIdsJson"
              take={25}
            />
          </div>

          {/* 3) Δισκογραφίες */}
          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Δισκογραφίες</h2>
            <DiscographiesEditorClient
              songTitle={song.title}
              initialVersions={initialVersions}
              hiddenInputId="versionsJson"
            />
          </div>
        </form>
      </section>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Backwards-compatibility exports
export type SongEditFormSong = SongForEdit;
export type SongCredits = SongCreditsDto;
