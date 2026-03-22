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

function resolveScoreFileUrlFromAsset(asset: any): string | null {
  if (!asset) return null;

  const kind = String(asset.kind ?? "").toUpperCase();

  if (kind === "LINK") {
    const url = String(asset.url ?? "").trim();
    return isUsableAssetPath(url) ? url : null;
  }

  const filePath = String(asset.filePath ?? "").trim();
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

function scoreTitleForAsset(asset: any, idx: number): string {
  const t1 = String(asset?.title ?? "").trim();
  if (t1) return t1;

  const t2 = String(asset?.label ?? "").trim();
  if (t2) return t2;

  const fp = String(asset?.filePath ?? "").trim();
  if (fp) {
    const bn = baseNameFromPath(fp);
    if (bn) return bn;
  }

  const u = String(asset?.url ?? "").trim();
  if (u) {
    const bn = baseNameFromPath(u);
    if (bn) return bn;
  }

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
    <section id="song-score" data-tour="scores-section" style={{ marginTop: 18 }}>
      <h2 data-tour="scores-title" style={{ marginBottom: 10, fontSize: "1.1rem" }}>
        Παρτιτούρα
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {scoreAssets.map((asset, idx) => {
          const url = resolveScoreFileUrlFromAsset(asset);
          const title = scoreTitleForAsset(asset, idx);

          console.log(
            "[SongScoresPanel:score-asset:json]",
            JSON.stringify(
              {
                assetId: asset?.id ?? null,
                kind: asset?.kind ?? null,
                type: asset?.type ?? null,
                title: asset?.title ?? null,
                label: asset?.label ?? null,
                mimeType: asset?.mimeType ?? null,
                url: asset?.url ?? null,
                filePath: asset?.filePath ?? null,
                isPrimary: asset?.isPrimary ?? false,
                sort: asset?.sort ?? null,
                resolvedUrl: url,
              },
              null,
              2,
            ),
          );

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
                  <ScorePlayerClient fileUrl={url} title="" />
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