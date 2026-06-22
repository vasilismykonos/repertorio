// apps/web/app/songs/[id]/edit/SongAssetsEditorClient.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import {
  ArrowDown,
  ArrowUp,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Star,
  Trash2,
  Music2,
  Image as ImageIcon,
  Film,
  Pencil,
  Wand2,
} from "lucide-react";

import Button from "@/app/components/buttons/Button";

/* =========================
   Config
========================= */

const DEFAULT_ADD_ASSET_PATH = "/assets/new";

/* =========================
   Types
========================= */

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
  url: string | null; // LINK
  filePath: string | null; // FILE

  mimeType: string | null;
  sizeBytes: string | null;

  label: string | null;
  sort: number;
  isPrimary: boolean;
};

type OmrJobDto = {
  id: string;
  assetId: number;
  state: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  stage: string;
  message: string;
  scoreAsset?: SongAssetDto;
  error?: string;
};

type Props = {
  songId: number;

  initialAssets: SongAssetDto[];
  hiddenInputId?: string; // default: assetsJson

  /**
   * Προαιρετικό hook για custom UI (modal etc).
   * Αν δεν δοθεί, θα κάνει fallback navigation σε /assets/new?songId=...&returnTo=...
   */
  onAddAsset?: (songId: number) => void;
};

/* =========================
   Step Model
========================= */

type AssetGroup = "SCORE" | "FILE" | "LINK";
type ScoreFormat = "PDF" | "JPG" | "JPEG" | "PNG" | "XML" | "MUSICXML" | "MXL";
type FileCategory = "IMAGE" | "VIDEO" | "AUDIO";

/* =========================
   Helpers
========================= */

function cleanText(v: any): string {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function isValidPosInt(n: any): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

function normalize(assets: SongAssetDto[]): SongAssetDto[] {
  const sorted = [...assets].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return sorted.map((a, idx) => ({ ...a, sort: idx * 10 }));
}

function coerceAsset(a: any, fallbackSort: number): SongAssetDto {
  const id = Number.isFinite(Number(a?.id)) ? Number(a.id) : 0;
  const kind: "LINK" | "FILE" = a?.kind === "FILE" ? "FILE" : "LINK";
  const type = String(a?.type ?? "GENERIC");

  const title = a?.title ?? null;
  const label = a?.label ?? null;

  const sort =
    typeof a?.sort === "number" && Number.isFinite(a.sort) ? a.sort : fallbackSort;

  const isPrimary = Boolean(a?.isPrimary);

  if (kind === "LINK") {
    return {
      id,
      kind,
      type,
      title,
      url: typeof a?.url === "string" ? a.url : "",
      filePath: null,
      mimeType: a?.mimeType ?? null,
      sizeBytes: a?.sizeBytes ?? null,
      label,
      sort,
      isPrimary,
    };
  }

  return {
    id,
    kind,
    type,
    title,
    url: null,
    filePath: typeof a?.filePath === "string" ? a.filePath : "",
    mimeType: a?.mimeType ?? null,
    sizeBytes: a?.sizeBytes ?? null,
    label,
    sort,
    isPrimary,
  };
}

function groupOf(a: SongAssetDto): AssetGroup {
  if (a.kind === "LINK") return "LINK";
  const t = String(a.type ?? "").toUpperCase();
  if (t === "SCORE" || t === "PDF") return "SCORE";
  return "FILE";
}

function applyGroupSelection(a: SongAssetDto, group: AssetGroup): SongAssetDto {
  if (group === "LINK") {
    return { ...a, kind: "LINK", type: "GENERIC", url: a.url ?? "", filePath: null };
  }

  if (group === "SCORE") {
    return {
      ...a,
      kind: "FILE",
      type: "PDF",
      url: null,
      filePath: a.filePath ?? "",
      label: null,
    };
  }

  return {
    ...a,
    kind: "FILE",
    type: "AUDIO",
    url: null,
    filePath: a.filePath ?? "",
    label: null,
  };
}

function applyScoreFormat(a: SongAssetDto, fmt: ScoreFormat): SongAssetDto {
  const upper = String(fmt).toUpperCase() as ScoreFormat;

  if (upper === "PDF") return { ...a, kind: "FILE", type: "PDF", label: "Score: PDF" };
  if (upper === "JPG" || upper === "JPEG" || upper === "PNG") {
    return { ...a, kind: "FILE", type: "IMAGE", label: `Score: ${upper}` };
  }

  return { ...a, kind: "FILE", type: "SCORE", label: `Score: ${upper}` };
}

function applyFileCategory(a: SongAssetDto, cat: FileCategory): SongAssetDto {
  const upper = String(cat).toUpperCase() as FileCategory;
  if (upper === "IMAGE") return { ...a, kind: "FILE", type: "IMAGE", label: "File: IMAGE" };
  if (upper === "AUDIO") return { ...a, kind: "FILE", type: "AUDIO", label: "File: AUDIO" };
  return { ...a, kind: "FILE", type: "GENERIC", label: "File: VIDEO" };
}

function setPrefix(label: string | null | undefined, prefix: "Score:" | "File:") {
  const v = cleanText(label);
  if (!v) return null;
  if (v.toLowerCase().startsWith(prefix.toLowerCase())) return v;
  return `${prefix} ${v}`;
}

function iconForAsset(a: SongAssetDto) {
  if (a.kind === "LINK") return LinkIcon;
  const t = String(a.type ?? "").toUpperCase();
  if (t === "AUDIO") return Music2;
  if (t === "IMAGE") return ImageIcon;
  if (cleanText(a.label).toUpperCase().includes("VIDEO")) return Film;
  if (t === "PDF" || t === "SCORE") return FileText;
  return Paperclip;
}

function summaryMid(a: SongAssetDto) {
  const g = groupOf(a);
  const lab = cleanText(a.label);

  if (g === "LINK") return "Link";
  if (g === "SCORE") {
    if (lab.toLowerCase().startsWith("score:")) return lab.split(":")[1]?.trim() || "—";
    return String(a.type ?? "—");
  }
  if (lab.toLowerCase().startsWith("file:")) return lab.split(":")[1]?.trim() || "—";
  return String(a.type ?? "—");
}

function isStep2Done(a: SongAssetDto) {
  const g = groupOf(a);
  if (g === "LINK") return true;
  const lab = cleanText(a.label).toUpperCase();
  if (g === "SCORE") return lab.startsWith("SCORE:");
  return lab.startsWith("FILE:");
}

function isStep3Done(a: SongAssetDto) {
  if (a.kind === "LINK") return Boolean(cleanText(a.url ?? ""));
  return Boolean(cleanText(a.filePath ?? ""));
}

function fileExtLower(value: string | null | undefined): string {
  const clean = String(value || "").split("?")[0].split("#")[0].trim();
  const idx = clean.lastIndexOf(".");
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : "";
}

function isScoreSourceAsset(a: SongAssetDto): boolean {
  if (a.kind !== "FILE") return false;
  const type = String(a.type || "").toUpperCase();
  const ext = fileExtLower(a.filePath || a.title || "");
  return groupOf(a) === "SCORE" && (type === "PDF" || type === "IMAGE" || ["pdf", "jpg", "jpeg", "png"].includes(ext));
}

function isEditableScoreAsset(a: SongAssetDto): boolean {
  if (a.kind !== "FILE") return false;
  const ext = fileExtLower(a.filePath || a.title || "");
  return String(a.type || "").toUpperCase() === "SCORE" || ["mxl", "musicxml", "xml"].includes(ext);
}

/* =========================
   Minimal styles
========================= */

const subStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#9a9a9a",
  wordBreak: "break-word",
};

function SegButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 40,
        borderRadius: 10,
        border: "1px solid #2a2a2a",
        background: active ? "#151515" : "#0f0f0f",
        color: "#eaeaea",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

/* =========================
   Component
========================= */

export default function SongAssetsEditorClient({
  songId,
  initialAssets,
  hiddenInputId = "assetsJson",
  onAddAsset,
}: Props) {
  const router = useRouter();

  const songIdOk = isValidPosInt(songId);

  const [assets, setAssets] = useState<SongAssetDto[]>(() => {
    const base = Array.isArray(initialAssets) ? initialAssets : [];
    const coerced = base.map((a, i) => coerceAsset(a, i * 10));
    const normalized = normalize(coerced);
    if (normalized.length > 0 && !normalized.some((x) => x.isPrimary)) {
      normalized[0] = { ...normalized[0], isPrimary: true };
    }
    return normalized;
  });
  const [recognizingAssetId, setRecognizingAssetId] = useState<number | null>(null);
  const [assetMessage, setAssetMessage] = useState<string>("");
  const [omrJobs, setOmrJobs] = useState<Record<number, OmrJobDto>>({});

  const jsonValue = useMemo(() => JSON.stringify(assets), [assets]);

  useEffect(() => {
    const el = document.getElementById(hiddenInputId) as HTMLInputElement | null;
    if (!el) return;
    el.value = jsonValue;
  }, [hiddenInputId, jsonValue]);

  useEffect(() => {
    const activeJobs = Object.values(omrJobs).filter((job) => job.state === "queued" || job.state === "running");
    if (activeJobs.length === 0) return;

    let cancelled = false;

    const poll = async () => {
      const updates = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const res = await fetch(`/api/assets/omr-jobs/${encodeURIComponent(job.id)}`, { cache: "no-store" });
            const text = await res.text();
            const data = text ? JSON.parse(text) : null;
            if (!res.ok) throw new Error(data?.message || data?.error || text || "OMR status failed.");
            return data as OmrJobDto;
          } catch (error: any) {
            return {
              ...job,
              state: "failed" as const,
              error: error?.message || "OMR status failed.",
              message: "OMR status failed.",
            };
          }
        }),
      );

      if (cancelled) return;

      setOmrJobs((prev) => {
        const next = { ...prev };
        for (const job of updates) next[job.assetId] = job;
        return next;
      });

      for (const job of updates) {
        if (job.state === "succeeded" && job.scoreAsset?.id) {
          setAssets((prev) => {
            const exists = prev.some((item) => Number(item.id) === Number(job.scoreAsset?.id));
            if (exists) return prev;
            return normalize([...prev, coerceAsset({ ...job.scoreAsset, label: "Score: OMR" }, prev.length * 10)]);
          });
          setAssetMessage("OMR completed and added a new editable score.");
          router.refresh();
        } else if (job.state === "failed") {
          setAssetMessage(job.error || job.message || "OMR failed.");
        }
      }
    };

    const timer = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [omrJobs, router]);

  const handleAddAsset = useCallback(() => {
    if (!songIdOk) return;

    // 1) custom handler (modal/whatever)
    if (typeof onAddAsset === "function") {
      onAddAsset(songId);
      return;
    }

    // 2) fallback navigation (κρατάμε και search+hash)
    const returnTo =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : `/songs/${songId}/edit`;

    const qs = new URLSearchParams({
      songId: String(songId),
      returnTo,
    });

    router.push(`${DEFAULT_ADD_ASSET_PATH}?${qs.toString()}`);
  }, [onAddAsset, router, songId, songIdOk]);

  function setPrimaryPerGroup(next: SongAssetDto[], index: number, isPrimary: boolean) {
    const cur = next[index];
    if (!cur) return next;
    const g = groupOf(cur);

    if (isPrimary) {
      return next.map((x, i) => {
        if (i === index) return { ...x, isPrimary: true };
        if (groupOf(x) === g) return { ...x, isPrimary: false };
        return x;
      });
    }

    return next.map((x, i) => (i === index ? { ...x, isPrimary: false } : x));
  }

  function updateAsset(index: number, patch: Partial<SongAssetDto>) {
    setAssets((prev) => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;

      let updated: SongAssetDto = { ...cur, ...patch };

      if (updated.kind === "LINK") {
        updated = {
          ...updated,
          filePath: null,
          url: typeof updated.url === "string" ? updated.url : "",
        };
      } else {
        updated = {
          ...updated,
          url: null,
          filePath: typeof updated.filePath === "string" ? updated.filePath : "",
        };
      }

      next[index] = updated;

      if (patch.isPrimary !== undefined) {
        const enforced = setPrimaryPerGroup(next, index, Boolean(patch.isPrimary));
        return normalize(enforced);
      }

      return normalize(next);
    });
  }

  function removeAsset(index: number) {
    setAssets((prev) => normalize(prev.filter((_, i) => i !== index)));
  }

  function move(index: number, dir: -1 | 1) {
    setAssets((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[to];
      next[to] = tmp;
      return normalize(next);
    });
  }

  async function recognizeScoreAsset(index: number) {
    const source = assets[index];
    if (!source?.id || recognizingAssetId) return;
    setAssetMessage("");
    setRecognizingAssetId(source.id);
    try {
      const res = await fetch(`/api/assets/${source.id}/omr`, { method: "POST" });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new Error(data?.message || data?.error || text || "Η αναγνώριση απέτυχε.");
      }
      const job = data?.job as OmrJobDto | undefined;
      if (!job?.id) throw new Error("OMR job did not start.");
      setOmrJobs((prev) => ({ ...prev, [source.id]: job }));
      setAssetMessage("OMR started in the background.");
      return;
      const scoreAsset = data?.scoreAsset;
      if (scoreAsset?.id) {
        setAssets((prev) => {
          const exists = prev.some((item) => Number(item.id) === Number(scoreAsset.id));
          if (exists) return prev;
          return normalize([...prev, coerceAsset({ ...scoreAsset, label: "Score: OMR" }, prev.length * 10)]);
        });
        setAssetMessage("Η αναγνώριση ολοκληρώθηκε και προστέθηκε νέα επεξεργάσιμη παρτιτούρα.");
      } else {
        setAssetMessage("Η αναγνώριση ολοκληρώθηκε.");
      }
      router.refresh();
    } catch (err: any) {
      setAssetMessage(err?.message || "Η αναγνώριση απέτυχε.");
    } finally {
      setRecognizingAssetId(null);
    }
  }

  function editAsset(asset: SongAssetDto) {
    if (!asset.id) return;
    const returnTo =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : `/songs/${songId}/edit`;
    router.push(`/assets/${asset.id}/edit?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <section className="song-edit-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 className="song-edit-section-title" style={{ margin: 0 }}>
            Υλικό
          </h2>

          
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={handleAddAsset}
          icon={Paperclip}
          disabled={!songIdOk}
          title={!songIdOk ? "Λείπει songId" : "Προσθήκη υλικού"}
        >
          Προσθήκη
        </Button>
      </div>

      {assets.length === 0 ? (
        <div style={{ marginTop: 12, opacity: 0.75 }}>Δεν υπάρχουν assets.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {assetMessage ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#121212",
                color: "#eaeaea",
              }}
            >
              {assetMessage}
            </div>
          ) : null}
          {assets.map((a, idx) => {
            const g = groupOf(a);
            const AssetIcon = iconForAsset(a);

            const mid = summaryMid(a);
            const right = a.kind === "LINK" ? cleanText(a.url ?? "") : cleanText(a.filePath ?? "");

            const step2ok = isStep2Done(a);
            const step3ok = isStep3Done(a);
            const omrJob = a.id ? omrJobs[a.id] : null;
            const omrActive = omrJob?.state === "queued" || omrJob?.state === "running";

            return (
              <div
                key={`${a.id || "new"}-${idx}`}
                style={{
                  border: "1px solid #2a2a2a",
                  background: "#0f0f0f",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <AssetIcon size={18} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "#eaeaea", fontWeight: 800 }}>
                          {g === "SCORE" ? "Παρτιτούρα" : g === "FILE" ? "Αρχείο" : "Σύνδεσμος"}
                        </span>
                        <span style={{ opacity: 0.55 }}>•</span>
                        <span style={{ color: "#d6d6d6" }}>{mid || "—"}</span>

                        {a.isPrimary ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: "1px solid #2a2a2a",
                              background: "#121212",
                              fontSize: 12,
                              color: "#eaeaea",
                            }}
                          >
                            <Star size={14} /> Primary
                          </span>
                        ) : null}
                      </div>

                      <div style={subStyle}>
                        {cleanText(a.title) ? cleanText(a.title) : "—"}
                        {right ? ` • ${right}` : ""}
                        {!step2ok || !step3ok ? (
                          <span style={{ marginLeft: 10, color: "#ffcf66" }}>
                            {!step2ok ? "• Ρύθμιση τύπου" : ""} {!step3ok ? "• Λείπει αρχείο/URL" : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {isScoreSourceAsset(a) ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => recognizeScoreAsset(idx)}
                        title="Αναγνώριση PDF/εικόνας σε MusicXML"
                        aria-label="Αναγνώριση παρτιτούρας"
                        icon={Wand2}
                        disabled={recognizingAssetId !== null || omrActive}
                      >
                        {omrActive
                          ? `${Math.max(0, Math.min(100, Number(omrJob?.progress || 0)))}%`
                          : recognizingAssetId === a.id
                            ? "Αναγνώριση..."
                            : "Αναγνώριση"}
                      </Button>
                    ) : null}
                    {a.id ? (
                      <Button
                        type="button"
                        variant={isEditableScoreAsset(a) ? "primary" : "secondary"}
                        onClick={() => editAsset(a)}
                        title={isEditableScoreAsset(a) ? "Αντικατάσταση με διορθωμένο MusicXML/MXL" : "Επεξεργασία asset"}
                        aria-label="Επεξεργασία asset"
                        icon={Pencil}
                      >
                        Επεξεργασία
                      </Button>
                    ) : null}
                    <Button type="button" variant="secondary" onClick={() => move(idx, -1)} title="Πάνω" aria-label="Πάνω" icon={ArrowUp} />
                    <Button type="button" variant="secondary" onClick={() => move(idx, 1)} title="Κάτω" aria-label="Κάτω" icon={ArrowDown} />
                    <Button type="button" variant="danger" onClick={() => removeAsset(idx)} title="Διαγραφή" aria-label="Διαγραφή" icon={Trash2} />
                  </div>
                </div>

                {omrJob ? (
                  <div
                    style={{
                      marginTop: 10,
                      border: "1px solid #2a2a2a",
                      borderRadius: 10,
                      background: "#080808",
                      padding: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "#d8d8d8" }}>
                      <span>{omrJob.error || omrJob.message || omrJob.stage || "OMR"}</span>
                      <span>{Math.max(0, Math.min(100, Number(omrJob.progress || 0)))}%</span>
                    </div>
                    <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: "#202020", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, Number(omrJob.progress || 0)))}%`,
                          height: "100%",
                          borderRadius: 999,
                          background:
                            omrJob.state === "failed"
                              ? "#ff5555"
                              : omrJob.state === "succeeded"
                                ? "#35d07f"
                                : "#6ea8ff",
                          transition: "width 240ms ease",
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {/* Step 1 */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <SegButton
                      active={g === "SCORE"}
                      icon={FileText}
                      label="Παρτιτούρα"
                      onClick={() => {
                        const updated = applyGroupSelection(a, "SCORE");
                        updateAsset(idx, {
                          kind: updated.kind,
                          type: updated.type,
                          url: updated.url,
                          filePath: updated.filePath,
                          label: null,
                        });
                      }}
                    />
                    <SegButton
                      active={g === "FILE"}
                      icon={Paperclip}
                      label="Αρχείο"
                      onClick={() => {
                        const updated = applyGroupSelection(a, "FILE");
                        updateAsset(idx, {
                          kind: updated.kind,
                          type: updated.type,
                          url: updated.url,
                          filePath: updated.filePath,
                          label: null,
                        });
                      }}
                    />
                    <SegButton
                      active={g === "LINK"}
                      icon={LinkIcon}
                      label="Σύνδεσμος"
                      onClick={() => {
                        const updated = applyGroupSelection(a, "LINK");
                        updateAsset(idx, {
                          kind: updated.kind,
                          type: updated.type,
                          url: updated.url,
                          filePath: updated.filePath,
                        });
                      }}
                    />
                  </div>
                </div>

                {/* Step 2 */}
                <div style={{ marginTop: 12 }}>
                  {g === "LINK" ? null : g === "SCORE" ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 12, color: "#cfcfcf" }}>Format παρτιτούρας</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(["PDF", "JPG", "JPEG", "PNG", "XML", "MUSICXML", "MXL"] as ScoreFormat[]).map((fmt) => {
                          const active =
                            cleanText(a.label).toUpperCase() === `SCORE: ${fmt}` ||
                            (fmt === "PDF" && String(a.type).toUpperCase() === "PDF");
                          return (
                            <Button
                              key={fmt}
                              type="button"
                              variant={active ? "primary" : "secondary"}
                              onClick={() => {
                                const updated = applyScoreFormat(a, fmt);
                                updateAsset(idx, {
                                  kind: updated.kind,
                                  type: updated.type,
                                  label: setPrefix(updated.label, "Score:"),
                                });
                              }}
                            >
                              {fmt}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 12, color: "#cfcfcf" }}>Κατηγορία αρχείου</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(["AUDIO", "IMAGE", "VIDEO"] as FileCategory[]).map((cat) => {
                          const active = cleanText(a.label).toUpperCase() === `FILE: ${cat}`;
                          return (
                            <Button
                              key={cat}
                              type="button"
                              variant={active ? "primary" : "secondary"}
                              onClick={() => {
                                const updated = applyFileCategory(a, cat);
                                updateAsset(idx, {
                                  kind: updated.kind,
                                  type: updated.type,
                                  label: setPrefix(updated.label, "File:"),
                                });
                              }}
                            >
                              {cat}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 3 */}
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "#cfcfcf" }}>Τίτλος</div>
                    <input
                      value={a.title ?? ""}
                      onChange={(e) => updateAsset(idx, { title: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #2a2a2a",
                        background: "#0b0b0b",
                        color: "#eaeaea",
                      }}
                      placeholder="π.χ. Partitura..."
                    />
                  </div>

                  {a.kind === "LINK" ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, color: "#cfcfcf" }}>URL</div>
                      <input
                        value={a.url ?? ""}
                        onChange={(e) => updateAsset(idx, { url: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #2a2a2a",
                          background: "#0b0b0b",
                          color: "#eaeaea",
                        }}
                        placeholder="https://..."
                      />
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, color: "#cfcfcf" }}>File path</div>
                      <input
                        value={a.filePath ?? ""}
                        onChange={(e) => updateAsset(idx, { filePath: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #2a2a2a",
                          background: "#0b0b0b",
                          color: "#eaeaea",
                        }}
                        placeholder="/uploads/assets/..."
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Button
                      type="button"
                      variant={a.isPrimary ? "primary" : "secondary"}
                      onClick={() => updateAsset(idx, { isPrimary: !a.isPrimary })}
                      icon={Star}
                    >
                      Primary (ανά κατηγορία)
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

