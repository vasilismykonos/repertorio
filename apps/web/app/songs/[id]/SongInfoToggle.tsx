"use client";

import { useState } from "react";

type SongVersion = {
  id?: number | null;
  year?: number | null;
  singerFront?: string | null;
  singerBack?: string | null;
  solist?: string | null;
  youtubeSearch?: string | null;
};

type SongInfoToggleProps = {
  categoryTitle?: string | null;
  composerName?: string | null;
  lyricistName?: string | null;
  rythmTitle?: string | null;
  basedOnSongTitle?: string | null;
  basedOnSongId?: number | null;
  characteristics?: string | null;
  views?: number | null;
  status?: string | null;
  versions?: SongVersion[] | null;
};

export default function SongInfoToggle(props: SongInfoToggleProps) {
  // Όπως στο παλιό: οι πληροφορίες είναι ανοιχτές by default
  const [open, setOpen] = useState(true);

  const characteristicsArray = props.characteristics
    ? props.characteristics.split(",").map((c) => c.trim())
    : [];

  // Fallbacks όπως στο παλιό get_field(...)
  const rythmText = props.rythmTitle || "Χωρίς ρυθμό";
  const categoryText = props.categoryTitle || "Χωρίς κατηγορία";
  const composerText = props.composerName || "Χωρίς συνθέτη";
  const lyricistText = props.lyricistName || "Χωρίς στιχουργό";

  return (
    <section style={{ marginBottom: 20 }}>
      {/* Το κουμπί ℹ️ Info */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid #333",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        ℹ️ <br /> Info
      </button>

      {/* Το περιεχόμενο που ανοιγοκλείνει (σαν το #song-info του παλιού PHP) */}
      {open && (
        <div
          style={{
            background: "#111",
            padding: "14px",
            borderRadius: 8,
            border: "1px solid #333",
            lineHeight: 1.5,
            fontSize: "0.95rem",
          }}
        >
          {/* Ρυθμός */}
          <div style={{ color: "darkgray" }}>Ρυθμός: {rythmText}</div>

          {/* Κατηγορία */}
          <div style={{ color: "darkgray" }}>
            Κατηγορία: {categoryText}
          </div>

          {/* Συνθέτης */}
          <div style={{ color: "darkgray" }}>
            Συνθέτης: {composerText}
          </div>

          {/* Στιχουργός */}
          <div style={{ color: "darkgray" }}>
            Στιχουργός: {lyricistText}
          </div>

          {/* Βασισμένο σε */}
          <div style={{ color: "darkgray" }}>
            Βασισμένο σε:{" "}
            {props.basedOnSongTitle ? (
              props.basedOnSongId ? (
                <a
                  href={`/songs/${props.basedOnSongId}`}
                  style={{ color: "#ddd", textDecoration: "none" }}
                >
                  {props.basedOnSongTitle}
                </a>
              ) : (
                props.basedOnSongTitle
              )
            ) : (
              "Πρωτότυπο"
            )}
          </div>

          {/* Χαρακτηριστικά */}
          {characteristicsArray.length > 0 && (
            <div style={{ marginTop: 8 }}>
              Χαρακτηριστικά:{" "}
              {characteristicsArray.map((ch, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    marginRight: 5,
                    color: "#fff",
                    background: "#333",
                    borderRadius: 4,
                    padding: "2px 6px",
                  }}
                >
                  {ch}
                </span>
              ))}
            </div>
          )}

          {/* Προβολές */}
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Προβολές:{" "}
            {typeof props.views === "number" ? props.views : 0}
          </div>

          {/* Κατάσταση */}
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Κατάσταση:{" "}
            <strong>{props.status || "Καταχωρήθηκε"}</strong>
          </div>

          {/* Δισκογραφία – όπως στο παλιό display_song_versions */}
          {props.versions && props.versions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  marginBottom: 6,
                  fontWeight: 600,
                  fontSize: "0.95rem",
                }}
              >
                Δισκογραφία:
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {props.versions.map((v, index) => (
                  <div
                    key={v.id ?? index}
                    style={{
                      color: "#fff",
                      fontSize: "0.9rem",
                      background: "#111",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #333",
                    }}
                  >
                    <span>{index + 1}.</span>{" "}
                    {v.singerFront && (
                      <span>
                        {" "}
                        🎙️A: <strong>{v.singerFront}</strong>
                      </span>
                    )}
                    {v.singerBack && (
                      <span>
                        {" "}
                        🎙️B: <strong>{v.singerBack}</strong>
                      </span>
                    )}
                    {v.solist && (
                      <span>
                        {" "}
                        Σολίστας: <strong>{v.solist}</strong>
                      </span>
                    )}
                    {v.year && <span> ({v.year})</span>}
                    {v.youtubeSearch && (
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                          v.youtubeSearch
                        )}&app=revanced`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ marginLeft: 10 }}
                        title="Αναζήτηση στο YouTube"
                      >
                        ▶
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
