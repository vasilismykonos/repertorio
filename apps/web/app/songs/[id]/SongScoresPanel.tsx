"use client";

import React, { useMemo } from "react";
import ScorePlayerClient from "./score/ScorePlayerClient";

function hasMxlExtension(value: string | null | undefined): boolean {
  if (!value) return false;
  const clean = String(value).split("?")[0].split("#")[0].trim().toLowerCase();
  return clean.endsWith(".mxl");
}

function hasMxlMimeType(value: string | null | undefined): boolean {
  if (!value) return false;
  const mt = String(value).trim().toLowerCase();
  return (
    mt.includes("application/vnd.recordare.musicxml") ||
    mt.includes("application/vnd.recordare.musicxml+xml") ||
    mt.includes("application/x-mxl") ||
    mt.includes("musicxml") ||
    mt.includes("/mxl")
  );
}

function isMxlScoreAsset(asset: any): boolean {
  if (!asset || typeof asset !== "object") return false;

  return (
    hasMxlMimeType(asset.mimeType) ||
    hasMxlExtension(asset.filePath) ||
    hasMxlExtension(asset.url) ||
    hasMxlExtension(asset.title)
  );
}

function isUsableAssetPath(value: string | null | undefined): boolean {
  const s = String(value ?? "").trim();
  if (!s) return false;
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/");
}

function scoreApiUrlFromPath(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const base = baseNameFromPath(s).replace(/\.(mxl|musicxml|xml)$/i, "");
  if (!base || !/^[A-Za-z0-9._-]+$/.test(base)) return null;

  return `/api/scores/${encodeURIComponent(base)}`;
}

function resolveScoreFileUrlFromAsset(asset: any): string | null {
  if (!asset) return null;

  const kind = String(asset.kind ?? "").toUpperCase();

  if (kind === "LINK") {
    const url = String(asset.url ?? "").trim();
    return isUsableAssetPath(url) ? url : null;
  }

  const filePath = String(asset.filePath ?? "").trim();
  const scoreApiUrl = scoreApiUrlFromPath(filePath);
  if (scoreApiUrl) return scoreApiUrl;
  if (isUsableAssetPath(filePath)) return filePath;

  const url = String(asset.url ?? "").trim();
  if (isUsableAssetPath(url)) return url;

  return null;
}

function baseNameFromPath(p: string): string {
  const s = String(p || "").trim();
  if (!s) return "";
  const parts = s.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

type Props = {
  open: boolean;
  assets: any[];
  canEdit?: boolean;
};

export default function SongScoresPanel(props: Props) {
  const { open, assets, canEdit = false } = props;

  const scoreAssets = useMemo(() => {
    const allAssets: any[] = Array.isArray(assets) ? assets : [];

    return allAssets
      .filter((a) => isMxlScoreAsset(a))
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

  if (!open || scoreAssets.length === 0) return null;

  return (
    <section id="song-score" data-tour="scores-section" className="song-score-panel">
      <div className="song-score-list">
        {scoreAssets.map((asset, idx) => {
          const url = resolveScoreFileUrlFromAsset(asset);
          const editAction =
            canEdit && asset?.id ? (
              <a
                href={`/assets/${asset.id}/notation-editor`}
                title="Επεξεργασία παρτιτούρας"
                className="sp-tools-toggle sp-tools-action"
              >
                Επεξεργασία
              </a>
            ) : null;

          return (
            <div
              key={asset?.id ?? `score-${idx}`}
              className="song-score-card"
            >
              {url ? (
                <div data-tour="scores-player">
                  <ScorePlayerClient fileUrl={url} title="" toolbarAction={editAction} />
                </div>
              ) : (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #442",
                    background: "#1a1a12",
                    color: "#f3e7a0",
                    fontSize: 14,
                  }}
                >
                  Το MXL asset δεν έχει usable public url/filePath.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
