"use client";

import React, { useMemo, useState } from "react";
import { Info, Music, FileText } from "lucide-react";

import ActionBar from "../../components/ActionBar";
import { A } from "../../components/buttons";
import Button from "../../components/buttons/Button";

import SongChordsClient from "./SongChordsClient";
import SongInfoToggle from "./SongInfoToggle";
import ScorePlayerClient from "./score/ScorePlayerClient";

import type { SongDetail } from "./page";

type PanelsOpen = {
  info: boolean;
  chords: boolean;
  scores: boolean;
};

type Props = {
  song: SongDetail;
  canEdit: boolean;

  finalLyrics: string;
  youtubeUrl: string;
  scoreFileUrl: string;

  schemaNode: React.ReactNode;

  /**
   * ✅ Προεπιλογές για open/closed των panels.
   * (Σε δεύτερο χρόνο θα τα γεμίζεις από user profile στο server page.tsx)
   */
  defaultPanelsOpen?: Partial<PanelsOpen>;
};

export default function SongPageClient(props: Props) {
  const {
    song,
    canEdit,
    finalLyrics,
    youtubeUrl,
    scoreFileUrl,
    schemaNode,
    defaultPanelsOpen,
  } = props;

  const hasChords = useMemo(() => {
    return Boolean(song.chords && song.chords.trim() !== "");
  }, [song.chords]);

  const initialPanels: PanelsOpen = useMemo(() => {
    // Default behavior (αν δεν έχεις ακόμα profile prefs):
    // - info: true
    // - chords: true μόνο αν υπάρχουν chords
    // - scores: true
    return {
      info: defaultPanelsOpen?.info ?? true,
      chords: defaultPanelsOpen?.chords ?? hasChords,
      scores: defaultPanelsOpen?.scores ?? true,
    };
  }, [defaultPanelsOpen, hasChords]);

  const [panels, setPanels] = useState<PanelsOpen>(initialPanels);

  function togglePanel<K extends keyof PanelsOpen>(key: K) {
    setPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        left={
          <>
            {A.backLink({
              href: "/songs",
              title: "Επιστροφή στη λίστα",
              label: "Τραγούδια",
            })}
          </>
        }
        right={
          <>
           
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
              icon={Music}
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
              icon={FileText}
            >
              Scores
            </Button>

             {canEdit &&
              A.editLink({
                href: `/songs/${song.id}/edit`,
                title: "Επεξεργασία τραγουδιού",
                label: "Επεξεργασία",
              })}

            {/* ✅ Local toggle actions (ίδιο Button, ίδια συμπεριφορά με τα κεντρικά) */}
          </>
        }
      />

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>
          {song.title}
        </h1>

        {song.tags.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
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
      </header>

      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, #333, transparent)",
          marginBottom: 14,
        }}
      />

      {/* ✅ Info panel */}
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
        status={song.status}
        versions={song.versions}
      />

      {/* ✅ Chords panel */}
      {hasChords && panels.chords ? (
        <SongChordsClient chords={song.chords!} originalKey={song.originalKey} />
      ) : null}

      <section style={{ marginTop: 18, marginBottom: 28 }}>
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

      {/* ✅ Scores panel */}
      {panels.scores ? (
        <section id="score-section" style={{ marginTop: 18 }}>
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
      ) : null}

      {schemaNode}
    </section>
  );
}
