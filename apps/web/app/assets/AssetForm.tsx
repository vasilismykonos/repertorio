// apps/web/app/assets/AssetForm.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  File as FileIcon,
  Link2,
  Music2,
  List as ListIcon,
  Layers,
} from "lucide-react";

/* =========================
   Types
========================= */

export type AssetAttachTarget =
  | { kind: "SONG"; songId: number; title?: string | null; slug?: string | null }
  | { kind: "LIST"; listId: number; title?: string | null }
  | { kind: "LIST_ITEM"; listItemId: number; title?: string | null }
  | { kind: "LIST_GROUP"; listGroupId: number; title?: string | null };

export type AssetForEdit = {
  id: number | null;
  kind: "FILE" | "LINK";
  type: string;
  title: string | null;
  url: string | null;
  filePath: string | null;
  mimeType: string | null;
  sizeBytes: string | null;

  // ✅ Συσχετίσεις (αν το API τις δίνει)
  songs?: { id: number; title: string; slug: string }[];
  lists?: { id: number; title: string }[];
  listItems?: { id: number; title: string; listId?: number | null }[];
  listGroups?: { id: number; title: string; fullTitle?: string | null }[];
};

export type AssetSaveResult = { ok: true; asset: any } | { ok: false; error: string };

type Props = {
  initial: AssetForEdit;
  saving: boolean;
  setSaving: (v: boolean) => void;
  persist: (fd: FormData) => Promise<AssetSaveResult>;
  afterSave?: (id: number) => void;
  attachTo?: AssetAttachTarget | null;
};

type Mode = "SCORE" | "FILE" | "LINK";

/* =========================
   Helpers
========================= */

function normalizeType(t: any): string {
  return String(t || "").toUpperCase().trim();
}

function modeFromInitial(initial: AssetForEdit): Mode {
  const k = String(initial.kind || "FILE").toUpperCase();
  const t = normalizeType(initial.type);
  if (k === "LINK") return "LINK";
  if (t === "SCORE") return "SCORE";
  return "FILE";
}

function extLower(name: string): string {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  if (i < 0) return "";
  return n.slice(i + 1).toLowerCase();
}

const ACCEPT_BY_MODE: Record<Mode, string | undefined> = {
  SCORE: ".mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml",
  FILE: ".mp3,.jpg,.jpeg,.pdf,audio/mpeg,application/pdf,image/jpeg",
  LINK: undefined,
};

const ALLOWED_EXT_BY_MODE: Record<Mode, Set<string> | null> = {
  SCORE: new Set(["mxl"]),
  FILE: new Set(["mp3", "jpg", "jpeg", "pdf"]),
  LINK: null,
};

function fileNotAllowedMessage(mode: Mode) {
  if (mode === "SCORE") return "Η παρτιτούρα πρέπει να είναι αρχείο .mxl";
  if (mode === "FILE") return "Το αρχείο πρέπει να είναι .mp3, .jpg, .jpeg ή .pdf";
  return "Μη επιτρεπτός τύπος αρχείου";
}

function attachLabel(a: AssetAttachTarget): string {
  switch (a.kind) {
    case "SONG":
      return `Τραγούδι #${a.songId}${a.title ? ` — ${a.title}` : ""}`;
    case "LIST":
      return `Λίστα #${a.listId}${a.title ? ` — ${a.title}` : ""}`;
    case "LIST_ITEM":
      return `List item #${a.listItemId}${a.title ? ` — ${a.title}` : ""}`;
    case "LIST_GROUP":
      return `Group #${a.listGroupId}${a.title ? ` — ${a.title}` : ""}`;
  }
}

function attachIcon(a: AssetAttachTarget) {
  switch (a.kind) {
    case "SONG":
      return <Music2 size={16} />;
    case "LIST":
      return <ListIcon size={16} />;
    case "LIST_ITEM":
      return <Layers size={16} />;
    case "LIST_GROUP":
      return <Layers size={16} />;
  }
}

function attachKindId(a: AssetAttachTarget): { attachKind: string; attachId: number } {
  switch (a.kind) {
    case "SONG":
      return { attachKind: "SONG", attachId: a.songId };
    case "LIST":
      return { attachKind: "LIST", attachId: a.listId };
    case "LIST_ITEM":
      return { attachKind: "LIST_ITEM", attachId: a.listItemId };
    case "LIST_GROUP":
      return { attachKind: "LIST_GROUP", attachId: a.listGroupId };
  }
}

/* =========================
   Component
========================= */

export default function AssetForm({
  initial,
  saving,
  setSaving,
  persist,
  afterSave,
  attachTo = null,
}: Props) {
  const [mode, setMode] = useState<Mode>(() => modeFromInitial(initial));

  const [title, setTitle] = useState<string>(initial.title || "");
  const [url, setUrl] = useState<string>(initial.url || "");
  const [filePath, setFilePath] = useState<string>(initial.filePath || "");
  const [mimeType, setMimeType] = useState<string>(initial.mimeType || "");
  const [sizeBytes, setSizeBytes] = useState<string>(initial.sizeBytes || "");

  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitLockRef = useRef(false);

  const initialKey = useMemo(() => {
    return JSON.stringify({
      id: initial.id,
      kind: initial.kind,
      type: initial.type,
      title: initial.title,
      url: initial.url,
      filePath: initial.filePath,
      mimeType: initial.mimeType,
      sizeBytes: initial.sizeBytes,
    });
  }, [
    initial.id,
    initial.kind,
    initial.type,
    initial.title,
    initial.url,
    initial.filePath,
    initial.mimeType,
    initial.sizeBytes,
  ]);

  useEffect(() => {
    setMode(modeFromInitial(initial));
    setTitle(initial.title || "");
    setUrl(initial.url || "");
    setFilePath(initial.filePath || "");
    setMimeType(initial.mimeType || "");
    setSizeBytes(initial.sizeBytes || "");
    setPickedFile(null);
    setError("");
    submitLockRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialKey]);

  const derived = useMemo(() => {
    if (mode === "LINK") return { kind: "LINK" as const, type: "GENERIC" as const };
    if (mode === "SCORE") return { kind: "FILE" as const, type: "SCORE" as const };
    return { kind: "FILE" as const, type: "GENERIC" as const };
  }, [mode]);

  const pickedInfo = useMemo(() => {
    if (!pickedFile) return null;
    return { name: pickedFile.name, size: String(pickedFile.size), mime: pickedFile.type || "" };
  }, [pickedFile]);

  useEffect(() => {
    setError("");
    setPickedFile(null);
    submitLockRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [mode]);

  const validatePickedFile = useCallback((f: File, m: Mode): string | null => {
    const allowed = ALLOWED_EXT_BY_MODE[m];
    if (!allowed) return null;
    const ext = extLower(f.name);
    if (!allowed.has(ext)) return fileNotAllowedMessage(m);
    return null;
  }, []);

  const onSave = useCallback(async () => {
    if (saving) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setError("");

    const fd = new FormData();
    fd.set("kind", derived.kind);
    fd.set("type", derived.type);
    fd.set("title", String(title || "").trim());

    if (attachTo) {
      const { attachKind, attachId } = attachKindId(attachTo);
      fd.set("attachKind", attachKind);
      fd.set("attachId", String(attachId));

      switch (attachTo.kind) {
        case "SONG":
          fd.set("songId", String(attachTo.songId));
          break;
        case "LIST":
          fd.set("listId", String(attachTo.listId));
          break;
        case "LIST_ITEM":
          fd.set("listItemId", String(attachTo.listItemId));
          break;
        case "LIST_GROUP":
          fd.set("listGroupId", String(attachTo.listGroupId));
          break;
      }
    }

    if (derived.kind === "LINK") {
      const u = String(url || "").trim();
      if (!u) {
        setError("Λείπει το URL");
        submitLockRef.current = false;
        return;
      }
      fd.set("url", u);
    } else {
      if (pickedFile) {
        const msg = validatePickedFile(pickedFile, mode);
        if (msg) {
          setError(msg);
          submitLockRef.current = false;
          return;
        }

        fd.set("file", pickedFile);
        fd.set("mimeType", pickedInfo?.mime || "");
        fd.set("sizeBytes", pickedInfo?.size || "");
      } else {
        if (filePath) fd.set("filePath", filePath);
        if (mimeType) fd.set("mimeType", mimeType);
        if (sizeBytes) fd.set("sizeBytes", sizeBytes);
      }
    }

    setSaving(true);
    try {
      const r = await persist(fd);
      if (!r.ok) {
        setError(r.error || "Αποτυχία αποθήκευσης");
        return;
      }
      const savedId = Number(r.asset?.id || initial.id || 0);
      if (afterSave && savedId) afterSave(savedId);
    } catch (e: any) {
      setError(e?.message || "Σφάλμα");
    } finally {
      setSaving(false);
      submitLockRef.current = false;
    }
  }, [
    saving,
    setSaving,
    persist,
    afterSave,
    initial.id,
    derived.kind,
    derived.type,
    title,
    url,
    filePath,
    mimeType,
    sizeBytes,
    pickedFile,
    pickedInfo?.mime,
    pickedInfo?.size,
    mode,
    attachTo,
    validatePickedFile,
  ]);

  useEffect(() => {
    const handler = () => void onSave();
    window.addEventListener("asset:submit", handler as any);
    return () => window.removeEventListener("asset:submit", handler as any);
  }, [onSave]);

  function ModeButton({
    value,
    icon,
    label,
    help,
  }: {
    value: Mode;
    icon: React.ReactNode;
    label: string;
    help?: string;
  }) {
    const active = mode === value;

    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => setMode(value)}
        title={help || label}
        aria-pressed={active}
        style={{
          // ✅ icons πάνω + κεντραρισμένα
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,

          // λίγο “tile” look
          minWidth: 120,
          padding: "12px 14px",
          borderRadius: 14,

          // ✅ πιο έντονο active περίγραμμα
          border: active
            ? "2px solid rgb(255, 255, 255)"
            : "1px solid rgba(255,255,255,0.12)",

          // ✅ λίγο πιο δυνατό active background
          background: active ? "rgba(34, 82, 255, 0.85)" : "rgba(255,255,255,0.04)",

          // ✅ μικρό glow όταν είναι selected
          boxShadow: active ? "0 0 0 3px rgba(255,255,255,0.08)" : "none",

          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.7 : 1,
          userSelect: "none",
          textAlign: "center",
        }}
      >
        <span style={{ display: "inline-flex", opacity: active ? 1 : 0.9 }}>
          {icon}
        </span>
        <span style={{ fontWeight: 900, lineHeight: 1.1 }}>{label}</span>
      </button>
    );
  }

  const isLink = derived.kind === "LINK";
  const isFile = derived.kind === "FILE";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 0" }}>
      {error ? (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            border: "1px solid rgba(255, 80, 80, 0.55)",
            background: "rgba(255, 80, 80, 0.08)",
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 18,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 10 }}>
            
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {/* ✅ icon πιο μεγάλο + πάνω */}
              <ModeButton
                value="SCORE"
                icon={<FileText size={22} />}
                label="Παρτιτούρα"
                help="Μόνο .mxl"
              />
              <ModeButton
                value="FILE"
                icon={<FileIcon size={22} />}
                label="Αρχείο"
                help="Μόνο .mp3, .jpg, .jpeg, .pdf"
              />
              <ModeButton
                value="LINK"
                icon={<Link2 size={22} />}
                label="Σύνδεσμος"
                help="Σύνδεσμος (URL)"
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ opacity: 0.85, fontWeight: 800 }}>Τίτλος</div>
            <input
              disabled={saving}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "70%", padding: "10px 12px", borderRadius: 10 }}
              placeholder="π.χ. Παρτιτούρα..."
            />
          </div>

          {isLink ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ opacity: 0.85, fontWeight: 800 }}>URL</div>
              <input
                disabled={saving}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10 }}
                placeholder="https://..."
              />
            </div>
          ) : null}

          {isFile ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ opacity: 0.85, fontWeight: 800 }}>Αρχείο</div>

              <input
                ref={fileInputRef}
                disabled={saving}
                type="file"
                accept={ACCEPT_BY_MODE[mode]}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;

                  if (f) {
                    const msg = validatePickedFile(f, mode);
                    if (msg) {
                      setError(msg);
                      setPickedFile(null);
                      e.target.value = "";
                      return;
                    }
                  }

                  setError("");
                  setPickedFile(f);
                }}
              />

              {pickedInfo ? (
                <div style={{ opacity: 0.85 }}>
                  Επιλεγμένο: <b>{pickedInfo.name}</b> ({pickedInfo.size} bytes)
                </div>
              ) : filePath ? (
                <div style={{ opacity: 0.85 }}>
                  Υπάρχον: <b>{filePath}</b>
                </div>
              ) : (
                <div style={{ opacity: 0.85 }}>Δεν έχει επιλεγεί αρχείο.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}