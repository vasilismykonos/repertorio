"use client";

import { useState } from "react";

type SongVersion = {
  id?: number | null;
  year?: number | null;
  singerFront?: string | null;
  singerBack?: string | null;
  solist?: string | null;
  youtubeSearch?: string | null;

  // optional IDs για links προς artists
  singerFrontId?: number | null;
  singerBackId?: number | null;
  solistId?: number | null;
};

type SongInfoToggleProps = {
  // ✅ τίτλος τραγουδιού για το YouTube query
  songTitle?: string | null;

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

function buildYouTubeSearchUrl(q: string): string {
  const query = encodeURIComponent((q ?? "").trim());
  return `https://www.youtube.com/results?search_query=${query}`;
}

// A+B+Solist (ό,τι υπάρχει)
function buildArtistsTail(v: SongVersion): string {
  const parts = [v.singerFront, v.singerBack, v.solist]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function YouTubeButton({
  href,
  title = "Αναζήτηση στο YouTube",
}: {
  href: string;
  title?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      style={{
        marginLeft: 10,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 24,
        borderRadius: 6,
        background: "#FF0000",
        border: "1px solid rgba(0,0,0,0.25)",
        textDecoration: "none",
        boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
        verticalAlign: "middle",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        style={{ display: "block" }}
      >
        <path fill="#fff" d="M10 8.5v7l6-3.5-6-3.5z" />
      </svg>
    </a>
  );
}

export default function SongInfoToggle(props: SongInfoToggleProps) {
  const [open, setOpen] = useState(true);

  const characteristicsArray = props.characteristics
    ? props.characteristics.split(",").map((c) => c.trim())
    : [];

  const rythmText = props.rythmTitle || "Χωρίς ρυθμό";
  const categoryText = props.categoryTitle || "Χωρίς κατηγορία";
  const composerText = props.composerName || "Χωρίς συνθέτη";
  const lyricistText = props.lyricistName || "Χωρίς στιχουργό";

  return (
    <section style={{ marginBottom: 20 }}>
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
          <div style={{ color: "darkgray" }}>Ρυθμός: {rythmText}</div>
          <div style={{ color: "darkgray" }}>Κατηγορία: {categoryText}</div>
          <div style={{ color: "darkgray" }}>Συνθέτης: {composerText}</div>
          <div style={{ color: "darkgray" }}>Στιχουργός: {lyricistText}</div>

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

          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Προβολές: {typeof props.views === "number" ? props.views : 0}
          </div>

          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Κατάσταση: <strong>{props.status || "Καταχωρήθηκε"}</strong>
          </div>

          {props.versions && props.versions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 6, fontWeight: 600, fontSize: "0.95rem" }}>
                Δισκογραφία:
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {props.versions.map((v, index) => {
                  const baseTitle = String(props.songTitle ?? "").trim();
                  const tail =
                    String(v.youtubeSearch ?? "").trim() ||
                    [v.singerFront, v.singerBack, v.solist]
                      .map((s) => String(s ?? "").trim())
                      .filter(Boolean)
                      .join(" ")
                      .replace(/\s+/g, " ")
                      .trim();

                  const ytQuery = [baseTitle, tail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
                  const ytHref = ytQuery ? `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}` : "";


                  return (
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
                          🎙️A:{" "}
                          {v.singerFrontId ? (
                            <a
                              href={`/artists/${v.singerFrontId}`}
                              style={{ color: "#ddd", textDecoration: "underline" }}
                            >
                              <strong>{v.singerFront}</strong>
                            </a>
                          ) : (
                            <strong>{v.singerFront}</strong>
                          )}
                        </span>
                      )}
                      {v.singerBack && (
                        <span>
                          {" "}
                          🎙️B:{" "}
                          {v.singerBackId ? (
                            <a
                              href={`/artists/${v.singerBackId}`}
                              style={{ color: "#ddd", textDecoration: "underline" }}
                            >
                              <strong>{v.singerBack}</strong>
                            </a>
                          ) : (
                            <strong>{v.singerBack}</strong>
                          )}
                        </span>
                      )}
                      {v.solist && (
                        <span>
                          {" "}
                          Σολίστας:{" "}
                          {v.solistId ? (
                            <a
                              href={`/artists/${v.solistId}`}
                              style={{ color: "#ddd", textDecoration: "underline" }}
                            >
                              <strong>{v.solist}</strong>
                            </a>
                          ) : (
                            <strong>{v.solist}</strong>
                          )}
                        </span>
                      )}
                      {v.year && <span> ({v.year})</span>}

                      {/* ✅ πάντα διαθέσιμο αν υπάρχει τίτλος ή/και ονόματα */}
                      {ytHref ? <YouTubeButton href={ytHref} /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
