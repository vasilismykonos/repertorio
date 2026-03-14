// apps/web/app/songs/[id]/SongAssetsClient.tsx
"use client";

import React, { useMemo } from "react";
import {
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Music2,
  Paperclip,
  Star,
} from "lucide-react";

import Button from "@/app/components/buttons/Button";

export type SongAssetDto = {
  id: number;
  kind: "LINK" | "FILE";
  type:
    | "GENERIC"
    | "YOUTUBE"
    | "SPOTIFY"
    | "PDF"
    | "AUDIO"
    | "IMAGE"
    | "SCORE"
    | string;
  title: string | null;
  url: string | null;
  filePath: string | null;
  mimeType: string | null;
  sizeBytes: string | null;
  label: string | null;
  sort: number;
  isPrimary: boolean;
};

type Props = {
  open: boolean;
  assets: SongAssetDto[];
};

function resolveHref(a: SongAssetDto): string | null {
  if (a.kind === "LINK") {
    const u = String(a.url ?? "").trim();
    return u ? u : null;
  }
  const fp = String(a.filePath ?? "").trim();
  if (!fp) return null;
  return fp;
}

function iconForType(type: string) {
  const t = String(type ?? "").toUpperCase();
  if (t === "AUDIO") return Music2;
  if (t === "PDF" || t === "SCORE") return FileText;
  return Paperclip;
}

function groupLabel(type: string): string {
  const t = String(type ?? "").toUpperCase();
  if (t === "AUDIO") return "Audio";
  if (t === "PDF") return "PDF";
  if (t === "SCORE") return "Παρτιτούρες";
  if (t === "YOUTUBE") return "YouTube";
  if (t === "SPOTIFY") return "Spotify";
  if (t === "IMAGE") return "Εικόνες";
  return "Links";
}

export default function SongAssetsClient({ open, assets }: Props) {
  const sorted = useMemo(() => {
    const arr = Array.isArray(assets) ? assets : [];
    return [...arr].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }, [assets]);

  const groups = useMemo(() => {
    const map = new Map<string, SongAssetDto[]>();
    for (const a of sorted) {
      const key = String(a.type ?? "GENERIC").toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const order = ["AUDIO", "SCORE", "PDF", "YOUTUBE", "SPOTIFY", "IMAGE", "GENERIC"];
    const keys = Array.from(map.keys()).sort((x, y) => {
      const ix = order.indexOf(x);
      const iy = order.indexOf(y);
      if (ix === -1 && iy === -1) return x.localeCompare(y);
      if (ix === -1) return 1;
      if (iy === -1) return -1;
      return ix - iy;
    });

    return keys.map((k) => ({ type: k, label: groupLabel(k), items: map.get(k)! }));
  }, [sorted]);

  if (!open) return null;

  return (
    <section id="song-assets" style={{ marginTop: 14 }}>
      <h3 style={{ margin: "6px 0 10px", fontSize: 18 }}>Υλικό</h3>

      {sorted.length === 0 ? (
        <div style={{ opacity: 0.75 }}>Δεν υπάρχουν assets.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((g) => (
            <div
              key={g.type}
              style={{
                border: "1px solid #333",
                background: "#0f0f0f",
                borderRadius: 14,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 14, opacity: 0.9 }}>
                <strong>{g.label}</strong>
                <span style={{ opacity: 0.6 }}> — {g.items.length}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {g.items
                  .slice()
                  .sort(
                    (a, b) =>
                      Number(b.isPrimary) - Number(a.isPrimary) ||
                      (a.sort ?? 0) - (b.sort ?? 0),
                  )
                  .map((a) => {
                    const href = resolveHref(a);
                    const TypeIcon = iconForType(a.type);
                    const title = (a.label || a.title || "").trim();

                    return (
                      <div
                        key={a.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "24px 1fr auto",
                          gap: 10,
                          alignItems: "center",
                          border: "1px solid #2b2b2b",
                          borderRadius: 12,
                          padding: "10px 10px",
                          background: "#121212",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.9 }}>
                          <TypeIcon size={18} />
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {title ? (
                              <span style={{ fontWeight: 600 }}>{title}</span>
                            ) : (
                              <span style={{ fontWeight: 600, opacity: 0.85 }}>{a.kind}</span>
                            )}

                            {a.isPrimary ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  border: "1px solid #333",
                                  background: "#111",
                                  fontSize: 12,
                                }}
                                title="Primary"
                              >
                                <Star size={14} /> Primary
                              </span>
                            ) : null}
                          </div>

                          {href ? (
                            <div style={{ opacity: 0.75, fontSize: 13, wordBreak: "break-word", marginTop: 4 }}>
                              {href}
                            </div>
                          ) : (
                            <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>—</div>
                          )}

                          {String(a.type ?? "").toUpperCase() === "AUDIO" && href ? (
                            <div style={{ marginTop: 8 }}>
                              <audio controls preload="none" style={{ width: "100%" }}>
                                <source src={href} />
                              </audio>
                            </div>
                          ) : null}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                              <Button type="button" variant="secondary" icon={ExternalLink} title="Άνοιγμα">
                                Άνοιγμα
                              </Button>
                            </a>
                          ) : null}

                          <span
                            title={a.kind}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              border: "1px solid #333",
                              background: "#111",
                              opacity: 0.9,
                            }}
                          >
                            {a.kind === "LINK" ? <LinkIcon size={16} /> : <Paperclip size={16} />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}