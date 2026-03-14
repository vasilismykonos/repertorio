// apps/web/app/songs/[id]/SongScoresPanel.tsx
"use client";

import React, { useMemo } from "react";
import ScorePlayerClient from "./score/ScorePlayerClient";

function isProbablyPublicUrlOrPath(p: string) {
  const s = String(p || "").trim();
  if (!s) return false;
  if (s.startsWith("http://") || s.startsWith("https://")) return true;
  if (s.startsWith("/api/")) return true;
  if (s.startsWith("/uploads/")) return true;
  return false;
}

function baseNameFromPath(p: string) {
  const s = String(p || "").trim();
  if (!s) return "";
  const parts = s.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function resolveScoreFileUrlFromAsset(asset: any): string | null {
  if (!asset) return null;

  const kind = String(asset.kind ?? "").toUpperCase();

  // LINK score: use url
  if (kind === "LINK") {
    const u = String(asset.url ?? "").trim();
    return u || null;
  }

  // FILE score: use filePath
  const fp = String(asset.filePath ?? "").trim();
  if (!fp) return null;

  // already a public path/url (e.g. /api/scores/293.mxl)
  if (isProbablyPublicUrlOrPath(fp)) return fp;

  // filesystem path => /api/scores/<basename>
  const bn = baseNameFromPath(fp);
  if (!bn) return null;

  return `/api/scores/${encodeURIComponent(bn)}`;
}

function scoreTitleForAsset(asset: any, idx: number): string {
  const t1 = String(asset?.title ?? "").trim();
  if (t1) return t1;

  const t2 = String(asset?.label ?? "").trim();
  if (t2) return t2;

  return `Παρτιτούρα ${idx + 1}`;
}

type Props = {
  open: boolean;
  assets: any[];
};

export default function SongScoresPanel(props: Props) {
  const { open, assets } = props;

  const scoreAssets = useMemo(() => {
    const allAssets: any[] = Array.isArray(assets) ? assets : [];

    const onlyScores = allAssets.filter(
      (a) => String(a?.type ?? "").toUpperCase() === "SCORE",
    );

    // Sort: primary first, then sort asc, then id asc
    return onlyScores
      .slice()
      .sort((a, b) => {
        const ap = a?.isPrimary ? 1 : 0;
        const bp = b?.isPrimary ? 1 : 0;
        if (ap !== bp) return bp - ap;

        const as = Number.isFinite(Number(a?.sort)) ? Number(a.sort) : 0;
        const bs = Number.isFinite(Number(b?.sort)) ? Number(b.sort) : 0;
        if (as !== bs) return as - bs;

        const ai = Number.isFinite(Number(a?.id)) ? Number(a.id) : 0;
        const bi = Number.isFinite(Number(b?.id)) ? Number(b.id) : 0;
        return ai - bi;
      });
  }, [assets]);

  // ✅ αν δεν είναι open ή δεν υπάρχουν scores: μην δείξεις τίποτα
  if (!open || scoreAssets.length === 0) return null;

  return (
    <section id="song-score" data-tour="scores-section" style={{ marginTop: 18 }}>
      <h2 data-tour="scores-title" style={{ marginBottom: 10, fontSize: "1.1rem" }}>
        Παρτιτούρα
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {scoreAssets.map((asset, idx) => {
          const url = resolveScoreFileUrlFromAsset(asset);
          const title = scoreTitleForAsset(asset, idx);

          return (
            <div
              key={asset?.id ?? `score-${idx}`}
              style={{
                borderRadius: 12,
                border: "1px solid #333",
                background: "#0b0b0b",
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "1.02rem" }}>{title}</div>

                {asset?.isPrimary ? (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid #444",
                      background: "#121212",
                      opacity: 0.95,
                      whiteSpace: "nowrap",
                    }}
                    title="Κύρια παρτιτούρα"
                  >
                    Κύρια
                  </span>
                ) : null}
              </div>

              {url ? (
                <div data-tour="scores-player">
                  <ScorePlayerClient fileUrl={url} title={""} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}