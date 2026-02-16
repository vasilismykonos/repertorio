// apps/web/app/songs/[id]/SongPageClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Info, Music, Mic, Guitar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import ActionBar from "../../components/ActionBar";
import { A } from "../../components/buttons";
import Button from "../../components/buttons/Button";

import SongChordsClient from "./SongChordsClient";
import SongInfoToggle from "./SongInfoToggle";
import ScorePlayerClient from "./score/ScorePlayerClient";
import SongSingerTunesClient from "./SongSingerTunesClient";

import type { SongDetail } from "./page";

type PanelsOpen = {
  info: boolean;
  singerTunes: boolean;
  chords: boolean;
  scores: boolean;
};

type RedirectDefault = "TITLE" | "CHORDS" | "LYRICS" | "SCORE";

type Props = {
  song: SongDetail;
  canEdit: boolean;

  finalLyrics: string;
  youtubeUrl: string;
  scoreFileUrl: string;

  schemaNode: React.ReactNode;

  defaultPanelsOpen?: Partial<PanelsOpen>;
  redirectDefault?: RedirectDefault;
};

const HEADER_OFFSET_PX = 0;

function scrollToId(id: string) {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function computeInitialPanels(
  hasChords: boolean,
  defaults?: Partial<PanelsOpen>,
): PanelsOpen {
  return {
    info: defaults?.info ?? true,
    singerTunes: defaults?.singerTunes ?? true,
    chords: defaults?.chords ?? hasChords,
    scores: defaults?.scores ?? true,
  };
}

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

export default function SongPageClient(props: Props) {
  const {
    song,
    canEdit,
    finalLyrics,
    youtubeUrl,
    scoreFileUrl,
    schemaNode,
    defaultPanelsOpen,
    redirectDefault,
  } = props;

  const router = useRouter();
  const sp = useSearchParams();

  // ------------------------------------------------------------
  // List context (NO userId). We pass listId + listPos.
  // ------------------------------------------------------------
  const listId = useMemo(() => {
    const v = sp.get("listId") ?? "";
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [sp]);

  const listPosParam = useMemo(() => {
    const v = sp.get("listPos") ?? "";
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [sp]);

  const hasListContext = Boolean(listId);

  // ------------------------------------------------------------
  // Load ordered song ids for list (same-origin)
  // GET /api/lists/:id/song-ids -> { listId, songIds: number[] }
  // ------------------------------------------------------------
  const [listSongIds, setListSongIds] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!listId) {
        setListSongIds(null);
        return;
      }

      try {
        const res = await fetch(`/api/lists/${listId}/song-ids`, { cache: "no-store" });
        const data = await readJson(res);

        if (!res.ok) {
          if (!cancelled) setListSongIds(null);
          return;
        }

        const idsRaw = (data && typeof data === "object" ? (data as any).songIds : null) as
          | unknown
          | null;

        const ids = Array.isArray(idsRaw)
          ? (idsRaw as unknown[])
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        if (!cancelled) setListSongIds(ids);
      } catch {
        if (!cancelled) setListSongIds(null);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [listId]);

  // ------------------------------------------------------------
  // Resolve current position:
  // - prefer listPos from URL
  // - fallback: find song.id inside listSongIds
  // ------------------------------------------------------------
  const resolvedPos = useMemo(() => {
    if (!listId) return null;
    if (!listSongIds || listSongIds.length === 0) return null;

    if (listPosParam !== null && listPosParam >= 0 && listPosParam < listSongIds.length) {
      // extra safety: verify it matches current song if possible
      const sidAtPos = listSongIds[listPosParam];
      if (sidAtPos === song.id) return listPosParam;
      // if mismatch, fallback to findIndex
    }

    const idx = listSongIds.findIndex((sid) => sid === song.id);
    return idx >= 0 ? idx : null;
  }, [listId, listPosParam, listSongIds, song.id]);

  const listNav = useMemo(() => {
    if (!listId) return null;
    if (!listSongIds || listSongIds.length === 0) return null;
    if (resolvedPos === null) return null;

    const prevPos = resolvedPos - 1;
    const nextPos = resolvedPos + 1;

    const prevSongId =
      prevPos >= 0 && prevPos < listSongIds.length ? listSongIds[prevPos] : null;

    const nextSongId =
      nextPos >= 0 && nextPos < listSongIds.length ? listSongIds[nextPos] : null;

    return {
      listId,
      curPos: resolvedPos,
      prevPos: prevSongId ? prevPos : null,
      nextPos: nextSongId ? nextPos : null,
      prevSongId,
      nextSongId,
    };
  }, [listId, listSongIds, resolvedPos]);

  function buildSongHref(targetSongId: number, targetPos: number | null): string {
    if (listNav && targetPos !== null) {
      return `/songs/${targetSongId}?listId=${encodeURIComponent(
        String(listNav.listId),
      )}&listPos=${encodeURIComponent(String(targetPos))}`;
    }
    return `/songs/${targetSongId}`;
  }

  function goPrev() {
    if (!listNav?.prevSongId || listNav.prevPos === null) return;
    router.push(buildSongHref(listNav.prevSongId, listNav.prevPos));
  }

  function goNext() {
    if (!listNav?.nextSongId || listNav.nextPos === null) return;
    router.push(buildSongHref(listNav.nextSongId, listNav.nextPos));
  }

  // ------------------------------------------------------------
  // Swipe detection (works)
  // ------------------------------------------------------------
  const touchRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t0: number;
  } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (!hasListContext) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchRef.current = {
      x0: t.clientX,
      y0: t.clientY,
      x1: t.clientX,
      y1: t.clientY,
      t0: Date.now(),
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!hasListContext) return;
    if (!touchRef.current) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchRef.current.x1 = t.clientX;
    touchRef.current.y1 = t.clientY;
  }

  function onTouchEnd() {
    if (!hasListContext) return;
    if (!listNav) return;

    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;

    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dt = Date.now() - s.t0;

    const MIN_X = 60;
    const MAX_Y = 60;
    const MAX_TIME = 900;

    if (adx < MIN_X) return;
    if (ady > MAX_Y) return;
    if (dt > MAX_TIME) return;

    // dx < 0 => swipe left => NEXT
    if (dx < 0) goNext();
    else goPrev();
  }

  // ------------------------------------------------------------
  // Panels logic
  // ------------------------------------------------------------
  const hasChords = Boolean(song.chords && song.chords.trim() !== "");
  const initialPanels = useMemo(
    () => computeInitialPanels(hasChords, defaultPanelsOpen),
    [hasChords, defaultPanelsOpen],
  );
  const [panels, setPanels] = useState<PanelsOpen>(initialPanels);

  useEffect(() => {
    setPanels(initialPanels);
  }, [song.id, initialPanels]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pref: RedirectDefault = redirectDefault ?? "TITLE";

    setPanels((prev) => {
      if (pref === "CHORDS") {
        if (!hasChords) return prev;
        return prev.chords ? prev : { ...prev, chords: true };
      }
      if (pref === "SCORE") {
        return prev.scores ? prev : { ...prev, scores: true };
      }
      return prev;
    });

    const id =
      pref === "CHORDS"
        ? "song-chords"
        : pref === "LYRICS"
          ? "song-lyrics"
          : pref === "SCORE"
            ? "song-score"
            : "song-title";

    const t = window.setTimeout(() => scrollToId(id), 0);
    return () => window.clearTimeout(t);
  }, [song.id, redirectDefault, hasChords]);

  function togglePanel<K extends keyof PanelsOpen>(key: K) {
    setPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const roomAction = A.room({
    onClick: () => {
      if (typeof window === "undefined") return;
      const w = window as any;
      if (typeof w.RepRoomsSendSong !== "function") {
        alert("Το σύστημα rooms δεν είναι διαθέσιμο.");
        return;
      }
      const selectedTonicity =
        typeof w.__repSelectedTonicity === "string" ? w.__repSelectedTonicity : null;
      w.RepRoomsSendSong(window.location.href, song.title, song.id, selectedTonicity);
    },
    title: "Αποστολή στο Room",
    label: "Room",
  });

  const backHref = hasListContext ? `/lists/${listId}` : "/songs";
  const backLabel = hasListContext ? "Λίστα" : "Τραγούδια";
  const backTitle = hasListContext ? "Επιστροφή στη λίστα" : "Επιστροφή στη λίστα τραγουδιών";

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 900,
        margin: "0 auto",
        touchAction: "pan-y",
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <ActionBar
        left={<>{A.backLink({ href: backHref, title: backTitle, label: backLabel })}</>}
         right={
          <>
           {A.share({ shareTitle: song.title, label: "Share" })}
            {canEdit
              ? A.editLink({
                  href: `/songs/${song.id}/edit`,
                  title: "Επεξεργασία τραγουδιού",
                  label: "Επεξεργασία",
                })
              : null}
            {roomAction}
          </>
        }

      />

      <header id="song-title" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>
          {song.title}
        </h1>

        {listNav ? (
          <div style={{ fontSize: "0.9rem", opacity: 0.7 }}>
            Swipe: δεξιά = προηγούμενο, αριστερά = επόμενο
          </div>
        ) : null}
      </header>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 6,
          marginBottom: 14,
        }}
      >
        <Button
          type="button"
          variant={panels.singerTunes ? "primary" : "secondary"}
          onClick={() => togglePanel("singerTunes")}
          title={panels.singerTunes ? "Απόκρυψη τονικοτήτων" : "Εμφάνιση τονικοτήτων"}
          aria-pressed={panels.singerTunes}
          icon={Mic}
        >
          Tunes
        </Button>

        <Button
          type="button"
          variant={panels.info ? "primary" : "secondary"}
          onClick={() => togglePanel("info")}
          title={panels.info ? "Απόκρυψη πληροφοριών" : "Εμφάνιση πληροφοριών"}
          aria-pressed={panels.info}
          icon={Info}
        >
          Info
        </Button>

        <Button
          type="button"
          variant={panels.chords ? "primary" : "secondary"}
          onClick={() => togglePanel("chords")}
          title={
            !hasChords
              ? "Δεν υπάρχουν ακόρντα για αυτό το τραγούδι"
              : panels.chords
                ? "Απόκρυψη ακόρντων"
                : "Εμφάνιση ακόρντων"
          }
          aria-pressed={panels.chords}
          icon={Guitar}
          disabled={!hasChords}
        >
          Chords
        </Button>

        <Button
          type="button"
          variant={panels.scores ? "primary" : "secondary"}
          onClick={() => togglePanel("scores")}
          title={panels.scores ? "Απόκρυψη παρτιτούρας" : "Εμφάνιση παρτιτούρας"}
          aria-pressed={panels.scores}
          icon={Music}
        >
          Scores
        </Button>
      </div>

      {/* Πίνακας tags */}
      {song.tags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {song.tags.map((t) => (
            <span
              key={t.id}
              style={{
                padding: "4px 10px",
                borderRadius: 99,
                border: "1px solid #333",
                background: "#111",
                fontSize: 14,
              }}
              title={t.slug ? `slug: ${t.slug}` : undefined}
            >
              #{t.title}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, #333, transparent)",
          marginBottom: 14,
          marginTop: 14,
        }}
      />

      {/* Πληροφορίες τραγουδιού */}
      <SongInfoToggle
        open={panels.info}
        songTitle={song.title}
        categoryTitle={song.categoryTitle}
        composerName={song.composerName}
        lyricistName={song.lyricistName}
        rythmTitle={song.rythmTitle}
        basedOnSongTitle={song.basedOnSongTitle}
        basedOnSongId={song.basedOnSongId}
        characteristics={song.characteristics}
        views={song.views}
        createdByUserId={song.createdByUserId}
        createdByDisplayName={song.createdByDisplayName}
        status={song.status}
        versions={song.versions}
      />

      {/* Τονικότητες ερμηνευτών */}
      <SongSingerTunesClient
        open={panels.singerTunes}
        songId={song.id}
        originalKeySign={song.originalKeySign}
      />

      {/* Ακόρντα */}
      {hasChords && panels.chords ? (
        <section id="song-chords">
          <SongChordsClient
            chords={song.chords}
            originalKey={song.originalKey}
            originalKeySign={song.originalKeySign}
          />
        </section>
      ) : null}

      {/* Στίχοι */}
      <section id="song-lyrics" style={{ marginTop: 18, marginBottom: 28 }}>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            padding: 14,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#0b0b0b",
            fontSize: 16,
            lineHeight: 1.6,
          }}
        >
          {finalLyrics}
        </pre>
      </section>

      {/* Παρτιτούρα */}
      {panels.scores && (
        <section id="song-score" style={{ marginTop: 18 }}>
          <h2 style={{ marginBottom: 10, fontSize: "1.1rem" }}>Παρτιτούρα</h2>
          {song.hasScore ? (
            <ScorePlayerClient fileUrl={scoreFileUrl} title={song.title} />
          ) : (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #333",
                padding: 12,
                background: "#111",
                opacity: 0.9,
              }}
            >
              Δεν υπάρχει παρτιτούρα για αυτό το τραγούδι.
            </div>
          )}
        </section>
      )}

      {schemaNode}
    </section>
  );
}
