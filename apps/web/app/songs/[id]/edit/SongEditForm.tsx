// apps/web/app/songs/[id]/edit/SongEditForm.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import DeleteSongButton from "./DeleteSongButton";
import TagsEditorClient, { type TagDto } from "./TagsEditorClient";
import DiscographiesEditorClient from "./DiscographiesEditorClient";
import SongCreditsEditorClient from "./SongCreditsEditorClient";
import CategoryRythmPickerClient from "./CategoryRythmPickerClient";
import SongAssetsEditorClient, { type SongAssetDto } from "./SongAssetsEditorClient";
import SongDuplicateWarning, {
  type SongDuplicateCandidate,
} from "./SongDuplicateWarning";
import SongOriginalKeyPicker, {
  type OriginalKeySign,
} from "./SongOriginalKeyPicker";

type SongVersionDto = {
  id: number;
  year: number | null;
  singerFront: string | null;
  singerBack: string | null;
  solist: string | null;
  youtubeSearch: string | null;

  singerFrontIds: number[] | null;
  singerBackIds: number[] | null;
  solistIds: number[] | null;
};

export type SongForEdit = {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;
  isInstrumental: boolean;

  composerName?: string | null;
  lyricistName?: string | null;

  tags: TagDto[];
  assets: SongAssetDto[];
  characteristics: string | null;

  originalKey: string | null;
  originalKeySign: "+" | "-" | null;

  chords: string | null;
  status: string | null;

  categoryId: number | null;
  rythmId: number | null;

  createdByUserId: number | null;
  createdByDisplayName?: string | null;

  hasScore: boolean;
  scoreFile: string | null;

  legacySongId?: number | null;

  versions: SongVersionDto[];
};

export type SongCreditsDto = {
  composerArtistIds: number[];
  lyricistArtistIds: number[];
};

export type CategoryOption = { id: number; title: string };
export type RythmOption = { id: number; title: string };

function splitNames(v: string | null | undefined): string[] {
  const s = (v ?? "").toString().trim();
  if (!s) return [];
  return s
    .split(/[,/]/g)
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function deriveFirstLyricsFromLyrics(lyrics: string | null | undefined): string {
  const text = (lyrics ?? "").toString();
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t) return t.length > 300 ? t.slice(0, 300) : t;
  }
  return "";
}

type Props = {
  song: SongForEdit;
  credits: SongCreditsDto;
  categories: CategoryOption[];
  rythms: RythmOption[];

  isOwner: boolean;
  currentUserRoleLabel: string;

  apiBase: string;

  canChangeCreator: boolean;
  canChangeStatus: boolean;
  createMode?: boolean;
};

const GREEK_CHORDS = [
  "Ντο",
  "Ντο#",
  "Ρε",
  "Ρε#",
  "Μι",
  "Φα",
  "Φα#",
  "Σολ",
  "Σολ#",
  "Λα",
  "Λα#",
  "Σι",
] as const;

function normalizeGreekChordName(
  name: string,
): (typeof GREEK_CHORDS)[number] | null {
  const t = name.trim().toLowerCase();

  switch (t) {
    case "ντο":
      return "Ντο";
    case "ντο#":
      return "Ντο#";
    case "ρε":
      return "Ρε";
    case "ρε#":
      return "Ρε#";
    case "μι":
      return "Μι";
    case "φα":
      return "Φα";
    case "φα#":
      return "Φα#";
    case "σολ":
      return "Σολ";
    case "σολ#":
      return "Σολ#";
    case "λα":
      return "Λα";
    case "λα#":
      return "Λα#";
    case "σι":
      return "Σι";
    default:
      return null;
  }
}

function detectLastChordAndSignFromChords(
  chordsText: string,
): {
  baseChord: (typeof GREEK_CHORDS)[number] | null;
  sign: "+" | "-" | null;
} {
  const text = (chordsText ?? "").toString();
  if (!text.trim()) return { baseChord: null, sign: null };

  const re = /(Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)\s*([+\-])?/gi;

  let lastChord: (typeof GREEK_CHORDS)[number] | null = null;
  let lastSign: "+" | "-" | null = null;

  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) {
    const norm = normalizeGreekChordName(m[1] ?? "");
    if (norm) lastChord = norm;

    if (m[2] === "+" || m[2] === "-") {
      lastSign = m[2];
    }
  }

  return { baseChord: lastChord, sign: lastSign };
}

function baseChordToOriginalKeyCodeString(
  baseChord: (typeof GREEK_CHORDS)[number] | null,
): string | null {
  if (!baseChord) return null;
  const idx = GREEK_CHORDS.indexOf(baseChord);
  if (idx < 0) return null;
  return String(101 + idx);
}

function originalKeyCodeStringToBaseChord(
  value: string | null | undefined,
): (typeof GREEK_CHORDS)[number] | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const tone = GREEK_CHORDS[Math.trunc(n) - 101];
  return tone ?? null;
}

function normalizeOriginalKeySign(value: unknown): OriginalKeySign | null {
  return value === "+" || value === "-" ? value : null;
}

const MAKAM_CHARACTERISTIC_PREFIX = "Δρόμος:";
const MAKAM_OPTIONS = [
  "Χιτζάζ",
  "Χιτζασκιάρ",
  "Ουσάκ",
  "Κιουρδί",
  "Νιαβέντ",
  "Ραστ",
  "Σεγκιάχ",
  "Σαμπάχ",
  "Σουζινάκ",
  "Χουζάμ",
  "Πειραιώτικος",
  "Μινόρε",
  "Ματζόρε",
  "Νικρίζ",
  "Νεβεσέρ",
  "Σαμπάχ μανές",
  "Μουστεάρ",
  "Χουσεϊνί",
] as const;

function splitCharacteristics(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isMakamCharacteristic(value: string): boolean {
  return /^(μακάμ|μακαμ|δρόμος|δρομος)\s*:/i.test(value.trim());
}

function extractMakamFromCharacteristics(value: string | null | undefined): string {
  const direct = splitCharacteristics(value).find(isMakamCharacteristic);
  if (direct) return direct.replace(/^(μακάμ|μακαμ|δρόμος|δρομος)\s*:/i, "").trim();

  const known = splitCharacteristics(value).find((item) =>
    MAKAM_OPTIONS.some((option) => option.localeCompare(item, "el-GR", { sensitivity: "accent" }) === 0),
  );
  return known ?? "";
}

function setMakamInCharacteristics(value: string | null | undefined, makam: string): string | null {
  const cleanMakam = makam.trim();
  const rest = splitCharacteristics(value).filter((item) => !isMakamCharacteristic(item));
  if (cleanMakam) rest.push(`${MAKAM_CHARACTERISTIC_PREFIX} ${cleanMakam}`);
  return rest.length ? rest.join(", ") : null;
}

export default function SongEditForm({
  song,
  credits,
  categories,
  rythms,
  createMode,
  isOwner,
  currentUserRoleLabel,
  apiBase,
  canChangeCreator,
  canChangeStatus,
}: Props) {
  const isCreate = !!createMode;
  const [statusValue, setStatusValue] = useState(song.status ?? "PENDING_APPROVAL");
  const [titleLive, setTitleLive] = useState(song.title ?? "");
  const [lyricsLive, setLyricsLive] = useState(song.lyrics ?? "");
  const [isInstrumental, setIsInstrumental] = useState(Boolean(song.isInstrumental));
  const [makamLive, setMakamLive] = useState(extractMakamFromCharacteristics(song.characteristics));
  const [makamSearchOpen, setMakamSearchOpen] = useState(false);
  const [makamQuery, setMakamQuery] = useState(extractMakamFromCharacteristics(song.characteristics));
  const makamPickerRef = useRef<HTMLDivElement | null>(null);
  const [creatorEditOpen, setCreatorEditOpen] = useState(false);
  const [creatorValue, setCreatorValue] = useState(String(song.createdByUserId ?? ""));

  const scoreUrl =
    song.hasScore && song.scoreFile ? `/api/scores/${song.scoreFile}` : null;

  const firstLyricsDerived = React.useMemo(
    () => deriveFirstLyricsFromLyrics(lyricsLive),
    [lyricsLive],
  );

  const initialTagIds = song.tags.map((t) => t.id);
  const initialAssets = song.assets;

  const initialVersions = (song.versions ?? []).map((v) => ({
    ...v,
    singerFrontIds: v.singerFrontIds ?? [],
    singerBackIds: v.singerBackIds ?? [],
    solistIds: v.solistIds ?? [],
  }));

  const initialComposerArtistIds = credits.composerArtistIds;
  const initialLyricistArtistIds = credits.lyricistArtistIds;

  const initialComposerNames = splitNames(song.composerName ?? null);
  const initialLyricistNames = splitNames(song.lyricistName ?? null);
  const makamSuggestions = React.useMemo(() => {
    const query = makamQuery.trim().toLocaleLowerCase("el-GR");
    if (!query) return MAKAM_OPTIONS.slice(0, 8);
    return MAKAM_OPTIONS.filter((option) =>
      option.toLocaleLowerCase("el-GR").includes(query),
    ).slice(0, 8);
  }, [makamQuery]);
  const hasExactMakamSuggestion = React.useMemo(() => {
    const query = makamQuery.trim();
    if (!query) return false;
    return MAKAM_OPTIONS.some((option) =>
      option.localeCompare(query, "el-GR", { sensitivity: "accent" }) === 0,
    );
  }, [makamQuery]);

  const [isBusy, setIsBusy] = useState(false);
  const router = useRouter();

  const [chordsLive, setChordsLive] = useState<string>(song.chords ?? "");
  const initialOriginalKey = String(song.originalKey ?? "").trim() || null;
  const [selectedOriginalKey, setSelectedOriginalKey] = useState<string | null>(
    initialOriginalKey,
  );
  const [selectedOriginalKeySign, setSelectedOriginalKeySign] =
    useState<OriginalKeySign | null>(
      initialOriginalKey ? normalizeOriginalKeySign(song.originalKeySign) ?? "+" : null,
    );
  const [originalKeyPickerOpen, setOriginalKeyPickerOpen] = useState(false);
  const [duplicateStatus, setDuplicateStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    SongDuplicateCandidate[]
  >([]);
  const [allowLikelyDuplicate, setAllowLikelyDuplicate] = useState(false);

  useEffect(() => {
    if (!makamSearchOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (target && makamPickerRef.current?.contains(target)) return;
      setMakamSearchOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [makamSearchOpen]);

  const duplicateCheckKey = React.useMemo(() => {
    return JSON.stringify([
      titleLive.trim(),
      firstLyricsDerived.trim(),
      lyricsLive.trim().slice(0, 2000),
    ]);
  }, [firstLyricsDerived, lyricsLive, titleLive]);

  React.useEffect(() => {
    if (!isCreate) return;
    setAllowLikelyDuplicate(false);
  }, [duplicateCheckKey, isCreate]);

  React.useEffect(() => {
    if (!isCreate) return;

    const title = titleLive.trim();
    const lyrics = lyricsLive.trim();
    const firstLyrics = firstLyricsDerived.trim();
    const hasEnoughInput =
      title.length >= 3 || firstLyrics.length >= 10 || lyrics.length >= 40;

    if (!hasEnoughInput) {
      setDuplicateStatus("idle");
      setDuplicateCandidates([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDuplicateStatus("loading");

      try {
        const res = await fetch("/api/songs/duplicate-candidates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            title,
            firstLyrics,
            lyrics,
            take: 6,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json().catch(() => null);
        const items = Array.isArray(json?.items) ? json.items : [];
        setDuplicateCandidates(items);
        setDuplicateStatus("done");
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("[SongEditForm] duplicate check failed", err);
        setDuplicateCandidates([]);
        setDuplicateStatus("error");
      }
    }, 650);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [firstLyricsDerived, isCreate, lyricsLive, titleLive]);

  const computedForSave = React.useMemo(() => {
    const text = (chordsLive ?? "").toString();
    if (!text.trim()) {
      return {
        originalKey: null,
        originalKeySign: null,
        baseChord: null,
      };
    }

    const det = detectLastChordAndSignFromChords(text);
    const codeStr = baseChordToOriginalKeyCodeString(det.baseChord);

    if (!codeStr || !det.baseChord) {
      return {
        originalKey: null,
        originalKeySign: null,
        baseChord: null,
      };
    }

    return {
      originalKey: codeStr,
      originalKeySign: det.sign,
      baseChord: det.baseChord,
    };
  }, [chordsLive]);

  const effectiveOriginalKey = selectedOriginalKey ?? computedForSave.originalKey;
  const effectiveOriginalKeySign: OriginalKeySign | null = selectedOriginalKey
    ? selectedOriginalKeySign ?? "+"
    : computedForSave.originalKey
      ? normalizeOriginalKeySign(computedForSave.originalKeySign) ?? "+"
      : null;
  const effectiveBaseChord = selectedOriginalKey
    ? originalKeyCodeStringToBaseChord(selectedOriginalKey)
    : computedForSave.baseChord;
  const originalKeySourceLabel = selectedOriginalKey ? "Τονικότητα" : "Αυτόματα";

  function handleCancel() {
    if (isCreate) router.push("/songs");
    else router.push(`/songs/${song.id}`);
  }

  function requestSaveSubmit() {
    const form = document.getElementById("song-edit-form") as HTMLFormElement | null;
    form?.requestSubmit();
  }

  function buildSaveErrorMessage(status: number, statusText: string, responseText: string) {
    const cleanText = responseText.trim();
    const looksLikeHtml =
      cleanText.startsWith("<!DOCTYPE") ||
      cleanText.startsWith("<html") ||
      /<title>.*<\/title>/i.test(cleanText);

    if (status === 502 || status === 503 || status === 504 || looksLikeHtml) {
      return "Αποτυχία αποθήκευσης τραγουδιού: ο server δεν απάντησε σωστά. Δοκίμασε ξανά σε λίγο.";
    }

    if (!cleanText) {
      return `Αποτυχία αποθήκευσης τραγουδιού: HTTP ${status}${statusText ? ` ${statusText}` : ""}`;
    }

    try {
      const parsed = JSON.parse(cleanText);
      const message = parsed?.message || parsed?.error;
      if (message) {
        return `Αποτυχία αποθήκευσης τραγουδιού: ${message}`;
      }
    } catch {
      // Keep the plain text fallback below.
    }

    return `Αποτυχία αποθήκευσης τραγουδιού: HTTP ${status}${statusText ? ` ${statusText}` : ""}\n${cleanText}`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy) return;

    const hasLikelyDuplicate =
      isCreate && duplicateCandidates.some((candidate) => candidate.level === "high");

    if (hasLikelyDuplicate && !allowLikelyDuplicate) {
      alert(
        "Βρέθηκε πολύ πιθανό υπάρχον τραγούδι. Έλεγξέ το πρώτα και, αν είναι όντως νέο τραγούδι, πάτησε «Δημιουργία νέου παρόλα αυτά».",
      );
      return;
    }

    setIsBusy(true);

    try {
      const formData = new FormData(e.currentTarget);

      const title = formData.get("title")?.toString() || "";
      const lyrics = (formData.get("lyrics") as string | null) ?? null;
      const chords = chordsLive ?? null;

      const categoryRaw = formData.get("categoryId")?.toString() || "";
      const rythmRaw = formData.get("rythmId")?.toString() || "";
      const categoryId = categoryRaw ? Number(categoryRaw) : null;
      const rythmId = rythmRaw ? Number(rythmRaw) : null;

      const createdByRaw = formData.get("createdByUserId")?.toString() ?? "";
      let createdByUserId: number | null = null;

      if (createdByRaw.trim() !== "") {
        const n = Number(createdByRaw);
        createdByUserId = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      }

      if (
        canChangeCreator &&
        !isCreate &&
        createdByRaw.trim() !== "" &&
        createdByUserId === null
      ) {
        alert("Μη έγκυρο User ID για Δημιουργό.");
        return;
      }

      const originalCreatedBy = song.createdByUserId;

      const creatorChanged =
        canChangeCreator &&
        !isCreate &&
        createdByRaw.trim() !== "" &&
        createdByUserId !== null &&
        createdByUserId !== originalCreatedBy;

      const tagIdsJson = formData.get("tagIdsJson")?.toString() || "[]";
      const assetsJson = formData.get("assetsJson")?.toString() || "[]";
      const versionsJson = formData.get("versionsJson")?.toString() || "[]";
      const creditsJson = formData.get("creditsJson")?.toString() || "{}";

      let tagIds: number[] = [];
      let assets: any[] | null = null;
      let versions: any[] | null = null;
      let composerArtistIds: number[] = [];
      let lyricistArtistIds: number[] = [];

      try {
        tagIds = JSON.parse(tagIdsJson);
      } catch {
        tagIds = [];
      }
      try {
        assets = JSON.parse(assetsJson);
      } catch {
        assets = null;
      }
      try {
        versions = JSON.parse(versionsJson);
      } catch {
        versions = null;
      }

      try {
        const creditsObj = JSON.parse(creditsJson);
        if (Array.isArray(creditsObj?.composerArtistIds)) {
          composerArtistIds = creditsObj.composerArtistIds
            .map((x: any) => Number(x))
            .filter((n: any) => Number.isFinite(n) && n > 0);
        }
        if (Array.isArray(creditsObj?.lyricistArtistIds)) {
          lyricistArtistIds = creditsObj.lyricistArtistIds
            .map((x: any) => Number(x))
            .filter((n: any) => Number.isFinite(n) && n > 0);
        }
      } catch {
        composerArtistIds = [];
        lyricistArtistIds = [];
      }

      const firstLyrics = isInstrumental ? null : deriveFirstLyricsFromLyrics(lyrics);

      const computedOriginalKey = effectiveOriginalKey ?? null;
      const computedOriginalKeySign = effectiveOriginalKey
        ? effectiveOriginalKeySign
        : null;

      const status =
        formData.get("status")?.toString().trim() || statusValue || "PENDING_APPROVAL";

      const body: any = {
        title: title.trim() || undefined,
        firstLyrics: firstLyrics ?? undefined,
        lyrics: isInstrumental ? null : lyrics,
        isInstrumental,
        chords,
        characteristics: setMakamInCharacteristics(song.characteristics, makamLive),
        originalKey: computedOriginalKey,
        originalKeySign: computedOriginalKeySign,
        status,
        categoryId,
        rythmId,
        tagIds,
        assets,
        versions,
        composerArtistIds,
        lyricistArtistIds,
      };

      if (creatorChanged) {
        body.createdByUserId = createdByUserId;
      }

      const endpoint = isCreate ? "/api/songs/full" : `/api/songs/${song.id}/full`;
      const method = isCreate ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(buildSaveErrorMessage(res.status, res.statusText, text));
        return;
      }

      if (isCreate) {
        let created: any = null;
        try {
          created = await res.json();
        } catch {
          created = null;
        }
        const newId = created?.id;
        router.push(newId ? `/songs/${newId}` : "/songs");
      } else {
        router.push(`/songs/${song.id}`);
      }
    } catch (err) {
      console.error(err);
      alert("Αποτυχία αποθήκευσης τραγουδιού.");
    } finally {
      setIsBusy(false);
    }
  }

  const backHref = isCreate ? "/songs" : `/songs/${song.id}`;

  return (
    <main className="song-edit-page">
      <style>{`
        .song-edit-input-light {
          background: #fff !important;
          color: #000 !important;
          border: 1px solid #ccc !important;
          caret-color: #000 !important;
        }
        .song-edit-input-light::placeholder {
          color: rgba(0,0,0,0.55) !important;
        }
      `}</style>

      <section className="song-edit-wrapper">
        <header className="song-edit-header">
          <p className="song-edit-breadcrumb">
            <Link href="/songs" className="song-edit-breadcrumb-link">
              Τραγούδια
            </Link>
            <span className="song-edit-breadcrumb-separator">/</span>
            <Link href={`/songs/${song.id}`} className="song-edit-breadcrumb-link">
              #{song.id}
            </Link>
            <span className="song-edit-breadcrumb-separator">/</span>
            <span className="song-edit-breadcrumb-current">
              {isCreate ? "Νέο τραγούδι" : "Επεξεργασία"}
            </span>
          </p>

          <h1 className="song-edit-title">
            {isCreate
              ? "Δημιουργία νέου τραγουδιού"
              : `Επεξεργασία τραγουδιού ${song.title}`}
          </h1>

          <div className="song-edit-meta" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "#111",
                }}
              >
                Δικαιώματα: <strong>{isOwner ? "Owner" : currentUserRoleLabel}</strong>
              </span>

              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  background: "#111",
                }}
              >
                Παρτιτούρα: <strong>{song.hasScore ? "Ναι" : "Όχι"}</strong>
                {scoreUrl && (
                  <>
                    {" "}
                    —{" "}
                    <a
                      href={scoreUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "underline" }}
                    >
                      {song.scoreFile}
                    </a>
                  </>
                )}
              </span>
            </div>
          </div>
        </header>

        <ActionBar
          left={
            <>
              {A.backLink({
                href: backHref,
                label: "Πίσω",
              })}
            </>
          }
          right={
            <>
              {A.save({
                onClick: requestSaveSubmit,
                disabled: isBusy,
                loading: isBusy,
                label: isCreate ? "Δημιουργία" : "Αποθήκευση",
                loadingLabel: isCreate ? "Δημιουργία..." : "Αποθήκευση...",
              })}
              {A.cancel({
                onClick: handleCancel,
                disabled: isBusy,
              })}

              {!isCreate && <DeleteSongButton songId={song.id} songTitle={song.title} />}
            </>
          }
        />

        <form id="song-edit-form" onSubmit={handleSubmit} className="song-edit-form">
          <input
            type="hidden"
            id="tagIdsJson"
            name="tagIdsJson"
            defaultValue={JSON.stringify(initialTagIds)}
          />
          <input
            type="hidden"
            id="assetsJson"
            name="assetsJson"
            defaultValue={JSON.stringify(initialAssets)}
          />
          <input
            type="hidden"
            id="versionsJson"
            name="versionsJson"
            defaultValue={JSON.stringify(initialVersions)}
          />

          <input
            type="hidden"
            name="__firstLyricsDerived"
            value={firstLyricsDerived}
            readOnly
          />

          <div className="song-edit-section song-edit-section-main">
            <h2 className="song-edit-section-title">Βασικές πληροφορίες</h2>

            <div className="song-edit-compact-grid">
            <div className="song-edit-field">
              <label htmlFor="title">Τίτλος *</label>
              <input
                type="text"
                id="title"
                name="title"
                value={titleLive}
                onChange={(e) => setTitleLive(e.currentTarget.value)}
                required
                className="song-edit-input-light"
              />
            </div>

            {isCreate ? (
              <SongDuplicateWarning
                status={duplicateStatus}
                candidates={duplicateCandidates}
                allowCreateAnyway={allowLikelyDuplicate}
                onAllowCreateAnyway={() => setAllowLikelyDuplicate(true)}
              />
            ) : null}

            <div className="song-edit-field">
              <label htmlFor="status">Κατάσταση</label>

              {canChangeStatus ? (
                <select
                  id="status"
                  name="status"
                  value={statusValue}
                  onChange={(e) => setStatusValue(e.currentTarget.value)}
                  className="song-edit-input-light"
                >
                  <option value="DRAFT">Πρόχειρο</option>
                  <option value="PENDING_APPROVAL">Σε αναμονή</option>
                  <option value="PUBLISHED">Δημοσιευμένο</option>
                  <option value="ARCHIVED">Αρχειοθετημένο</option>
                </select>
              ) : (
                <>
                  <input type="hidden" name="status" value={statusValue} readOnly />
                  <input
                    type="text"
                    value={statusValue}
                    disabled
                    readOnly
                    className="song-edit-input-light"
                  />
                </>
              )}
            </div>
            </div>

            <div className="song-edit-subsection">
              <div className="song-edit-subsection-head">
                <h3>Μουσικά στοιχεία</h3>
              </div>

            <div className="song-edit-field song-edit-field-chords">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label htmlFor="chords" style={{ margin: 0 }}>
                  Συγχορδίες
                </label>

                <button
                  type="button"
                  onClick={() => setOriginalKeyPickerOpen(true)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid #333",
                    background: "#111",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: "18px",
                    opacity: 0.95,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    fontWeight: 650,
                  }}
                  title="Επιλογή τονικότητας τραγουδιού"
                >
                  {effectiveBaseChord ? (
                    <>
                      {originalKeySourceLabel}:{" "}
                      <strong>
                        {effectiveBaseChord}
                        {effectiveOriginalKeySign ?? ""}
                      </strong>
                    </>
                  ) : (
                    "Επιλογή τονικότητας"
                  )}
                </button>
              </div>

              <SongOriginalKeyPicker
                open={originalKeyPickerOpen}
                value={{
                  originalKey: selectedOriginalKey,
                  originalKeySign: selectedOriginalKeySign,
                }}
                detected={{
                  originalKey: computedForSave.originalKey,
                  originalKeySign: normalizeOriginalKeySign(
                    computedForSave.originalKeySign,
                  ),
                }}
                onClose={() => setOriginalKeyPickerOpen(false)}
                onSave={(nextValue) => {
                  setSelectedOriginalKey(nextValue.originalKey);
                  setSelectedOriginalKeySign(
                    normalizeOriginalKeySign(nextValue.originalKeySign) ?? "+",
                  );
                  setOriginalKeyPickerOpen(false);
                }}
              />

              <textarea
                id="chords"
                name="chords"
                rows={6}
                value={chordsLive}
                onChange={(e) => setChordsLive(e.currentTarget.value)}
                className="song-edit-input-light"
              />

              {!chordsLive.trim() && (
                <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }} />
              )}
            </div>

            <div className="song-edit-field song-edit-field-makam">
              <label htmlFor="makamRoad">Δρόμος / Μακάμ</label>
              <div ref={makamPickerRef} className="song-edit-makam-picker">
                <button
                  id="makamRoad"
                  type="button"
                  className="song-edit-makam-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={makamSearchOpen}
                  onClick={() => {
                    setMakamQuery(makamLive);
                    setMakamSearchOpen((value) => !value);
                  }}
                >
                  <span>{makamLive.trim() || "Επιλογή δρόμου / μακάμ"}</span>
                  <b aria-hidden="true">⌄</b>
                </button>
                {makamSearchOpen ? (
                  <div className="song-edit-makam-dropdown">
                    <input
                      value={makamQuery}
                      onChange={(e) => setMakamQuery(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setMakamSearchOpen(false);
                        if (e.key === "Enter" && makamQuery.trim()) {
                          e.preventDefault();
                          setMakamLive(makamQuery.trim());
                          setMakamSearchOpen(false);
                        }
                      }}
                      className="song-edit-input-light song-edit-makam-search"
                      placeholder="Αναζήτηση ή νέος δρόμος..."
                      autoComplete="off"
                      autoFocus
                    />
                    {makamSuggestions.length ? (
                      <div className="song-edit-makam-options" role="listbox">
                        {makamSuggestions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={option === makamLive}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setMakamLive(option);
                              setMakamQuery(option);
                              setMakamSearchOpen(false);
                            }}
                            className={option === makamLive ? "selected" : ""}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="song-edit-makam-empty">
                        Δεν βρέθηκε υπάρχων δρόμος.
                      </div>
                    )}
                    {makamQuery.trim() && !hasExactMakamSuggestion ? (
                      <button
                        type="button"
                        className="song-edit-makam-create"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const next = makamQuery.trim();
                          setMakamLive(next);
                          setMakamSearchOpen(false);
                        }}
                      >
                        Προσθήκη νέου: <strong>{makamQuery.trim()}</strong>
                      </button>
                    ) : null}
                    {makamLive.trim() ? (
                      <button
                        type="button"
                        className="song-edit-makam-clear"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setMakamLive("");
                          setMakamQuery("");
                          setMakamSearchOpen(false);
                        }}
                      >
                        Καθαρισμός επιλογής
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            </div>

            {canChangeCreator && !isCreate && (
              <div className="song-edit-creator-row">
                {!creatorEditOpen ? (
                  <input type="hidden" name="createdByUserId" value={creatorValue} readOnly />
                ) : null}
                <span>
                  Δημιουργός:{" "}
                  <strong>
                    {song.createdByDisplayName?.trim()
                      ? `${song.createdByDisplayName.trim()} (#${song.createdByUserId ?? "—"})`
                      : song.createdByUserId != null
                        ? `#${song.createdByUserId}`
                        : "—"}
                  </strong>
                </span>
                <button type="button" onClick={() => setCreatorEditOpen((value) => !value)}>
                  {creatorEditOpen ? "Κλείσιμο" : "Αλλαγή"}
                </button>
                {creatorEditOpen ? (
                  <label className="song-edit-creator-input" htmlFor="createdByUserId">
                    <span>User ID</span>
                    <input
                      type="number"
                      id="createdByUserId"
                      name="createdByUserId"
                      value={creatorValue}
                      onChange={(e) => setCreatorValue(e.currentTarget.value)}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      className="song-edit-input-light"
                      placeholder="π.χ. 4"
                    />
                  </label>
                ) : null}
              </div>
            )}

            <div className="song-edit-subsection song-edit-subsection-lyrics">
            <div className="song-edit-field song-edit-field-lyrics">
              <label htmlFor="lyrics">Στίχοι</label>
              <button
                type="button"
                onClick={() => setIsInstrumental((value) => !value)}
                aria-pressed={isInstrumental}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  width: "fit-content",
                  margin: "0 0 8px",
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: isInstrumental ? "1px solid #00bcd4" : "1px solid #333",
                  background: isInstrumental ? "#073843" : "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 750,
                }}
                title="Όταν είναι ενεργό, το τραγούδι αποθηκεύεται ως οργανικό και οι στίχοι απενεργοποιούνται."
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: isInstrumental ? "#00d4e6" : "#666",
                    boxShadow: isInstrumental ? "0 0 0 3px rgba(0,212,230,0.18)" : "none",
                  }}
                />
                {isInstrumental ? "Οργανικό ενεργό" : "Οργανικό τραγούδι"}
              </button>
              {isInstrumental && (
                <div style={{ margin: "0 0 8px", opacity: 0.8, fontSize: 13 }}>
                  Οι στίχοι είναι απενεργοποιημένοι και θα αποθηκευτούν κενοί.
                </div>
              )}
              <textarea
                id="lyrics"
                name="lyrics"
                rows={10}
                value={lyricsLive}
                onChange={(e) => setLyricsLive(e.currentTarget.value)}
                disabled={isInstrumental}
                className="song-edit-input-light"
                style={isInstrumental ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
              />
            </div>
            </div>

            <SongAssetsEditorClient
              songId={song.id}
              initialAssets={initialAssets}
              hiddenInputId="assetsJson"
            />
          </div>

          <CategoryRythmPickerClient
            initialCategoryId={song.categoryId}
            initialRythmId={song.rythmId}
            categories={categories}
            rythms={rythms}
          />

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Συντελεστές</h2>
            <SongCreditsEditorClient
              initialComposerArtistIds={initialComposerArtistIds}
              initialLyricistArtistIds={initialLyricistArtistIds}
              initialComposerNames={initialComposerNames}
              initialLyricistNames={initialLyricistNames}
              hiddenInputName="creditsJson"
            />
          </div>

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Tags</h2>
            <TagsEditorClient initialTags={song.tags} hiddenInputId="tagIdsJson" take={25} />
          </div>

          <div className="song-edit-section">
            <h2 className="song-edit-section-title">Δισκογραφίες</h2>
            <DiscographiesEditorClient
              songTitle={titleLive || song.title}
              initialVersions={initialVersions}
              hiddenInputId="versionsJson"
            />
          </div>
        </form>
      </section>
    </main>
  );
}

export type SongEditFormSong = SongForEdit;
export type SongCredits = SongCreditsDto;
