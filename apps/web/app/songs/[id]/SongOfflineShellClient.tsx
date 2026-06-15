"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readOfflineSongs } from "@/lib/offlineStore";
import SongPageClient from "./SongPageClient";
import type { SongDetail } from "./page";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; song: SongDetail };

function currentSongId(): number | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/songs\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text === "0" || text.toLowerCase() === "false") return null;
  return text;
}

function fullChords(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const flag = text.toLowerCase();
  if (flag === "0" || flag === "1" || flag === "true" || flag === "false") return null;
  return text;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tagDtos(song: any): SongDetail["tags"] {
  if (Array.isArray(song?.tags)) {
    return song.tags
      .map((tag: any) => {
        const id = Number(tag?.id);
        const title = textOrNull(tag?.title);
        if (!Number.isFinite(id) || id <= 0 || !title) return null;
        return { id, title, slug: textOrNull(tag?.slug) || "" };
      })
      .filter((tag: OfflineTag | null): tag is OfflineTag => Boolean(tag));
  }

  const ids = Array.isArray(song?.tagIds) ? song.tagIds : [];
  const titles = Array.isArray(song?.tagTitles) ? song.tagTitles : [];

  return ids
    .map((id: unknown, index: number) => {
      const tagId = Number(id);
      const title = textOrNull(titles[index]);
      if (!Number.isFinite(tagId) || tagId <= 0 || !title) return null;
      return { id: tagId, title, slug: "" };
    })
    .filter((tag: OfflineTag | null): tag is OfflineTag => Boolean(tag));
}

type OfflineTag = { id: number; title: string; slug: string };

function singerVersions(song: any): SongDetail["versions"] {
  if (Array.isArray(song?.versions)) {
    return song.versions.map((version: any, index: number) => ({
      id: Number(version?.id ?? version?.versionId ?? index + 1) || index + 1,
      year: numberOrNull(version?.year ?? version?.releaseYear ?? version?.release_year),
      singerFront: textOrNull(version?.singerFront ?? version?.singer_front ?? version?.singerFrontName),
      singerBack: textOrNull(version?.singerBack ?? version?.singer_back ?? version?.singerBackName),
      solist: textOrNull(version?.solist ?? version?.soloist ?? version?.solistName ?? version?.soloistName),
      youtubeSearch: textOrNull(version?.youtubeSearch ?? version?.youtube_search ?? version?.youtubeQuery),
      singerFrontId: numberOrNull(version?.singerFrontId ?? version?.singer_front_id),
      singerBackId: numberOrNull(version?.singerBackId ?? version?.singer_back_id),
      solistId: numberOrNull(version?.solistId ?? version?.soloistId ?? version?.solist_id),
    }));
  }

  const pairs = Array.isArray(song?.versionSingerPairs) ? song.versionSingerPairs : [];
  return pairs.map((pair: any, index: number) => ({
    id: index + 1,
    year: null,
    singerFront: textOrNull(pair?.frontName),
    singerBack: textOrNull(pair?.backName),
    solist: null,
    youtubeSearch: null,
    singerFrontId: numberOrNull(pair?.frontId),
    singerBackId: numberOrNull(pair?.backId),
    solistId: null,
  }));
}

function normalizeAssets(raw: unknown): SongDetail["assets"] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((asset: any) => {
      const id = Number(asset?.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      const sort = Number(asset?.sort);
      return {
        id,
        kind: String(asset?.kind || "").toUpperCase() === "LINK" ? "LINK" : "FILE",
        type: String(asset?.type || "GENERIC").toUpperCase(),
        title: textOrNull(asset?.title),
        url: textOrNull(asset?.url),
        filePath: textOrNull(asset?.filePath),
        mimeType: textOrNull(asset?.mimeType),
        sizeBytes: textOrNull(asset?.sizeBytes),
        label: textOrNull(asset?.label),
        sort: Number.isFinite(sort) ? sort : 0,
        isPrimary: asset?.isPrimary === true,
      };
    })
    .filter((asset): asset is SongDetail["assets"][number] => Boolean(asset))
    .sort((a, b) => (a.sort !== b.sort ? a.sort - b.sort : a.id - b.id));
}

function hasMxlAsset(assets: SongDetail["assets"]): boolean {
  return assets.some((asset) => {
    const fields = [asset.mimeType, asset.filePath, asset.url, asset.title].map((value) => String(value || "").toLowerCase());
    return fields.some((value) => value.includes("musicxml") || value.includes("/mxl") || value.split("?")[0].endsWith(".mxl"));
  });
}

function offlineSongId(song: any): number | null {
  const id = Number(song?.id ?? song?.legacySongId ?? song?.song_id);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

function toSongDetail(song: any): SongDetail | null {
  const id = offlineSongId(song);
  if (!id) return null;
  const assets = normalizeAssets(song?.assets);

  return {
    id,
    title: textOrNull(song?.title) || `Τραγούδι #${id}`,
    firstLyrics: textOrNull(song?.firstLyrics ?? song?.first_lyrics),
    lyrics: textOrNull(song?.lyrics),
    characteristics: textOrNull(song?.characteristics),
    originalKey: textOrNull(song?.originalKey ?? song?.original_key),
    originalKeySign: song?.originalKeySign === "+" || song?.originalKeySign === "-" ? song.originalKeySign : null,
    chords: fullChords(song?.chords),
    status: textOrNull(song?.status),
    categoryId: numberOrNull(song?.categoryId ?? song?.category_id),
    rythmId: numberOrNull(song?.rythmId ?? song?.rythm_id ?? song?.rhythmId ?? song?.rhythm_id),
    makamId: numberOrNull(song?.makamId ?? song?.makam_id),
    categoryTitle: textOrNull(song?.categoryTitle ?? song?.category_title ?? song?.category),
    composerName: textOrNull(song?.composerName ?? song?.composer_name),
    lyricistName: textOrNull(song?.lyricistName ?? song?.lyricist_name),
    rythmTitle: textOrNull(song?.rythmTitle ?? song?.rhythmTitle ?? song?.rythm),
    basedOnSongId: numberOrNull(song?.basedOnSongId ?? song?.based_on_song_id),
    basedOnSongTitle: textOrNull(song?.basedOnSongTitle ?? song?.based_on_song_title),
    views: Number(song?.views || 0) || 0,
    createdByUserId: numberOrNull(song?.createdByUserId ?? song?.createdById ?? song?.created_by_user_id),
    createdByDisplayName: textOrNull(song?.createdByDisplayName ?? song?.createdByName ?? song?.created_by_display_name),
    tags: tagDtos(song),
    hasScore: Boolean(song?.hasScore ?? song?.partiture ?? hasMxlAsset(assets)),
    assets,
    versions: singerVersions(song),
  };
}

function finalLyrics(song: SongDetail): string {
  const isOrganic =
    String(song.characteristics || "")
      .split(",")
      .map((item) => item.trim().toLocaleLowerCase("el-GR"))
      .includes("οργανικό") ||
    song.tags.some((tag) => tag.title.trim().toLocaleLowerCase("el-GR") === "οργανικό");

  if (isOrganic) return "(Οργανικό)";
  if (!song.lyrics || song.lyrics.trim() === "") return "(Χωρίς διαθέσιμους στίχους)";
  return song.lyrics;
}

function youtubeUrl(song: SongDetail): string {
  const words = String(song.firstLyrics || song.lyrics || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.title} ${words}`.trim())}`;
}

export default function SongOfflineShellClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadSong() {
      const id = currentSongId();
      if (!id) {
        setState({ status: "error", message: "Δεν εντοπίστηκε ID τραγουδιού." });
        return;
      }

      const snapshot = await readOfflineSongs().catch(() => null);
      const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
      const found = items.find((item) => offlineSongId(item) === id);
      const rawDetail = snapshot?.detailsById?.[String(id)] || found;
      const detail = rawDetail ? toSongDetail(rawDetail) : null;

      if (cancelled) return;
      setState(
        detail
          ? { status: "ready", song: detail }
          : {
              status: "error",
              message: "Το τραγούδι δεν βρέθηκε στα offline δεδομένα αυτής της συσκευής.",
            },
      );
    }

    void loadSong();
    return () => {
      cancelled = true;
    };
  }, []);

  const shell = useMemo(() => {
    if (state.status !== "ready") return null;
    const hasChords = Boolean(state.song.chords && state.song.chords.trim());
    return {
      finalLyrics: finalLyrics(state.song),
      youtubeUrl: youtubeUrl(state.song),
      defaultPanelsOpen: { info: true, singerTunes: true, chords: hasChords, scores: false },
    };
  }, [state]);

  if (state.status === "loading") {
    return (
      <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
        <p>Φόρτωση offline τραγουδιού...</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
        <h1>Τραγούδι</h1>
        <p>{state.message}</p>
      </section>
    );
  }

  return (
    <SongPageClient
      song={state.song}
      canEdit={false}
      finalLyrics={shell?.finalLyrics || finalLyrics(state.song)}
      youtubeUrl={shell?.youtubeUrl || youtubeUrl(state.song)}
      schemaNode={null}
      defaultPanelsOpen={shell?.defaultPanelsOpen}
      redirectDefault="TITLE"
    />
  );
}
