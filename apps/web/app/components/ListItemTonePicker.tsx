"use client";

import React, { useEffect, useMemo, useState } from "react";

import UserMentionsField, { type Mention } from "@/app/components/UserMentionsField";
import {
  TONICITY_VALUES,
  isValidTonicity,
  type TonicityValue,
} from "@/app/components/tonicity";
import type { UserPick } from "@/lib/users/types";

export type TonicitySign = "+" | "-";

export type ListItemToneValue = {
  selectedTonicity: string | null;
  selectedTonicitySign: TonicitySign | null;
  selectedSingerTuneId?: number | null;
  selectedSingerTuneTitle?: string | null;
  selectedSingerTuneTune?: string | null;
};

export type ListItemSingerSuggestion = {
  title: string;
  tune?: string | null;
  singerTuneId?: number | null;
};

type SingerTuneRow = {
  id: number;
  title: string;
  tune: string;
};

type Props = {
  value: ListItemToneValue;
  onChange: (value: ListItemToneValue) => void;
  songId?: number | null;
  songOriginalKey?: string | null;
  songOriginalKeySign?: TonicitySign | null;
  singerSuggestions?: ListItemSingerSuggestion[];
  disabled?: boolean;
  showSingerInButton?: boolean;
  forceExplicitStyle?: boolean;
  buttonClassName?: string;
  compact?: boolean;
};

const NATURAL_TONICITIES = TONICITY_VALUES.filter((tone) => !tone.includes("#"));
const SHARP_TONICITIES = TONICITY_VALUES.filter((tone) => tone.includes("#"));

const ORIGINAL_KEY_TONICITIES = [
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

const RECENT_SINGER_TUNE_USERS_KEY = "rep:singerTuneRecentUsers";
const RECENT_SINGER_TUNE_USERS_LIMIT = 4;

export function normalizeTonicitySign(value: unknown): TonicitySign | null {
  return value === "+" || value === "-" ? value : null;
}

export function normalizeTonicityValue(value: unknown): TonicityValue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[+-]$/, "");
  return isValidTonicity(normalized) ? normalized : null;
}

export function originalKeyCodeToTonicity(value: unknown): TonicityValue | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const tone = ORIGINAL_KEY_TONICITIES[Math.trunc(n) - 101];
  return tone && isValidTonicity(tone) ? tone : null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function normalizePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeTitleKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("el");
}

function toneButtonLabel(tone: TonicityValue, sign: TonicitySign | null) {
  return `${tone}${sign ?? " "}`;
}

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function normalizeUserPick(raw: any): UserPick | null {
  const id = Number(raw?.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const username = String(
    raw?.username ||
      raw?.userName ||
      (typeof raw?.email === "string" ? raw.email.split("@")[0] : "") ||
      `user${id}`,
  );

  return {
    id,
    username,
    displayName:
      raw?.displayName != null
        ? String(raw.displayName)
        : raw?.name != null
          ? String(raw.name)
          : null,
    avatarUrl: raw?.avatarUrl != null ? String(raw.avatarUrl) : null,
  };
}

function uniqUsers(list: UserPick[]) {
  const seen = new Set<number>();
  const out: UserPick[] = [];
  for (const u of list) {
    const normalized = normalizeUserPick(u);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    out.push(normalized);
  }
  return out;
}

function readRecentSingerTuneUsers() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SINGER_TUNE_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? uniqUsers(parsed).slice(0, RECENT_SINGER_TUNE_USERS_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function writeRecentSingerTuneUsers(users: UserPick[]) {
  if (typeof window === "undefined") return;
  const normalized = uniqUsers(users).slice(0, RECENT_SINGER_TUNE_USERS_LIMIT);
  try {
    window.localStorage.setItem(RECENT_SINGER_TUNE_USERS_KEY, JSON.stringify(normalized));
  } catch {
    // localStorage is only a convenience for suggestions.
  }
}

function mergeMentionSuggestions(selfUser: UserPick | null, recentUsers: UserPick[]) {
  const head = selfUser ? [selfUser] : [];
  const tail = recentUsers.filter((u) => u.id !== selfUser?.id);
  return uniqUsers([...head, ...tail]).slice(0, RECENT_SINGER_TUNE_USERS_LIMIT + 1);
}

export default function ListItemTonePicker({
  value,
  onChange,
  songId,
  songOriginalKey,
  songOriginalKeySign,
  singerSuggestions = [],
  disabled,
  showSingerInButton = true,
  forceExplicitStyle = false,
  buttonClassName = "",
  compact = false,
}: Props) {
  const originalTonicity = useMemo(
    () => originalKeyCodeToTonicity(songOriginalKey),
    [songOriginalKey],
  );
  const originalSign = normalizeTonicitySign(songOriginalKeySign);

  const selectedSingerTuneTitle = normalizeText(value.selectedSingerTuneTitle);
  const selectedSingerTuneTune = normalizeTonicityValue(value.selectedSingerTuneTune);
  const selectedListTonicity = normalizeTonicityValue(value.selectedTonicity);
  const selectedSingerTuneId = normalizePositiveInt(value.selectedSingerTuneId);
  const displayTonicity = selectedListTonicity ?? (selectedSingerTuneId ? selectedSingerTuneTune : null);
  const displaySign = displayTonicity ? normalizeTonicitySign(value.selectedTonicitySign) : null;
  const effectiveTonicity =
    selectedListTonicity ??
    selectedSingerTuneTune ??
    originalTonicity;
  const effectiveSign =
    normalizeTonicitySign(value.selectedTonicitySign) ?? originalSign;

  const [open, setOpen] = useState(false);
  const [draftTonicity, setDraftTonicity] = useState<TonicityValue | null>(
    effectiveTonicity,
  );
  const [draftSign, setDraftSign] = useState<TonicitySign | null>(effectiveSign);
  const [draftSingerTuneId, setDraftSingerTuneId] = useState<number | null>(
    normalizePositiveInt(value.selectedSingerTuneId),
  );
  const [draftSingerTuneTitle, setDraftSingerTuneTitle] = useState<string | null>(
    selectedSingerTuneTitle,
  );
  const [draftSingerTuneTune, setDraftSingerTuneTune] = useState<TonicityValue | null>(
    selectedSingerTuneTune,
  );
  const [singerRows, setSingerRows] = useState<SingerTuneRow[] | null>(null);
  const [singerRowsError, setSingerRowsError] = useState<string | null>(null);
  const [savingSinger, setSavingSinger] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [titleMentions, setTitleMentions] = useState<Mention[]>([]);
  const [pickedTitleUsers, setPickedTitleUsers] = useState<UserPick[]>([]);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserPick[]>([]);

  const normalizedSingerSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: ListItemSingerSuggestion[] = [];

    for (const s of singerSuggestions ?? []) {
      const title = normalizeText(s?.title);
      if (!title) continue;
      const key = normalizeTitleKey(title);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        title,
        tune: normalizeTonicityValue(s?.tune) ?? normalizeText(s?.tune),
        singerTuneId: normalizePositiveInt(s?.singerTuneId),
      });
    }

    return out.slice(0, 8);
  }, [singerSuggestions]);

  const rowsByTitle = useMemo(() => {
    const map = new Map<string, SingerTuneRow>();
    for (const row of singerRows ?? []) {
      const title = normalizeText(row.title);
      if (!title) continue;
      const key = normalizeTitleKey(title);
      if (!map.has(key)) map.set(key, row);
    }
    return map;
  }, [singerRows]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingSinger) setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, savingSinger]);

  useEffect(() => {
    if (!open) return;
    const currentSongId = normalizePositiveInt(songId);

    let cancelled = false;

    async function loadSingerRows() {
      if (!currentSongId) {
        setSingerRows([]);
        setSingerRowsError(null);
        return;
      }

      setSingerRows(null);
      setSingerRowsError(null);

      try {
        const res = await fetch(`/api/songs/${currentSongId}/singer-tunes`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const body = await readJson(res);

        if (!res.ok) {
          const message =
            (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
          throw new Error(String(message));
        }

        if (!cancelled) {
          setSingerRows(Array.isArray(body) ? (body as SingerTuneRow[]) : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setSingerRows([]);
          setSingerRowsError(e?.message || "Αποτυχία φόρτωσης φωνών");
        }
      }
    }

    async function loadMentionSuggestions() {
      const recentUsers = readRecentSingerTuneUsers();
      let selfUser: UserPick | null = null;

      try {
        const res = await fetch("/api/current-user", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const body = await readJson(res);
        if (res.ok) selfUser = normalizeUserPick((body as any)?.user);
      } catch {
        selfUser = null;
      }

      if (!cancelled) {
        setMentionSuggestions(mergeMentionSuggestions(selfUser, recentUsers));
      }
    }

    void loadSingerRows();
    void loadMentionSuggestions();

    return () => {
      cancelled = true;
    };
  }, [open, songId]);

  function openPicker() {
    if (disabled) return;
    setDraftTonicity(effectiveTonicity);
    setDraftSign(effectiveSign);
    setDraftSingerTuneId(normalizePositiveInt(value.selectedSingerTuneId));
    setDraftSingerTuneTitle(selectedSingerTuneTitle);
    setDraftSingerTuneTune(selectedSingerTuneTune);
    setFormTitle(selectedSingerTuneTitle ?? "");
    setTitleMentions([]);
    setPickedTitleUsers([]);
    setSingerRowsError(null);
    setOpen(true);
  }

  function chooseTone(tone: TonicityValue) {
    if (!draftSign) return;

    setDraftTonicity(tone);
    setDraftSingerTuneId(null);
    setDraftSingerTuneTitle(null);
    setDraftSingerTuneTune(null);
    setFormTitle("");
    setTitleMentions([]);
    setPickedTitleUsers([]);
    setSingerRowsError(null);
  }

  function chooseSingerRow(row: SingerTuneRow) {
    const tone = normalizeTonicityValue(row.tune);
    const singerTuneId = normalizePositiveInt(row.id);
    const title = normalizeText(row.title);

    if (!tone || !singerTuneId || !title) {
      setSingerRowsError("Η επιλεγμένη φωνή δεν έχει έγκυρο τόνο.");
      return;
    }

    if (!draftSign) {
      setDraftTonicity(tone);
      setSingerRowsError("Για επιλογή φωνής χρειάζεται πρώτα πρόσημο.");
      return;
    }

    setDraftTonicity(tone);
    setDraftSingerTuneId(singerTuneId);
    setDraftSingerTuneTitle(title);
    setDraftSingerTuneTune(tone);
    setFormTitle(title);
    setTitleMentions([]);
    setPickedTitleUsers([]);
    setSingerRowsError(null);
  }

  function applySuggestion(suggestion: ListItemSingerSuggestion) {
    const matchedRow = rowsByTitle.get(normalizeTitleKey(suggestion.title));
    if (matchedRow) {
      chooseSingerRow(matchedRow);
      return;
    }

    setFormTitle(suggestion.title);
    const suggestedTone = normalizeTonicityValue(suggestion.tune);
    if (suggestedTone) setDraftTonicity(suggestedTone);
    setDraftSingerTuneId(null);
    setDraftSingerTuneTitle(null);
    setDraftSingerTuneTune(null);
    setSingerRowsError(null);
  }

  function clearSelection() {
    setDraftTonicity(null);
    setDraftSign(null);
    setDraftSingerTuneId(null);
    setDraftSingerTuneTitle(null);
    setDraftSingerTuneTune(null);
    setFormTitle("");
    setTitleMentions([]);
    setPickedTitleUsers([]);
    setSingerRowsError(null);
  }

  function onPickTitleUser(user: UserPick) {
    setPickedTitleUsers((prev) => uniqUsers([user, ...prev]));
  }

  function rememberPickedTitleUsers() {
    if (pickedTitleUsers.length === 0) return;
    const current = readRecentSingerTuneUsers();
    writeRecentSingerTuneUsers([...pickedTitleUsers, ...current]);
  }

  async function saveSelection() {
    const currentSongId = normalizePositiveInt(songId);
    const cleanTitle = normalizeText(formTitle);

    if (draftTonicity && !draftSign) {
      setSingerRowsError("Για επιλογή τόνου ή φωνής χρειάζεται πρόσημο.");
      return;
    }

    if (!cleanTitle) {
      onChange({
        selectedTonicity: draftTonicity,
        selectedTonicitySign: draftTonicity ? draftSign : null,
        selectedSingerTuneId: null,
        selectedSingerTuneTitle: null,
        selectedSingerTuneTune: null,
      });
      setOpen(false);
      return;
    }

    if (!currentSongId) {
      setSingerRowsError("Δεν υπάρχει έγκυρο τραγούδι για αυτή τη γραμμή.");
      return;
    }

    if (!draftTonicity) {
      setSingerRowsError("Διάλεξε τόνο για τη φωνή.");
      return;
    }

    if (!draftSign) {
      setSingerRowsError("Για επιλογή φωνής χρειάζεται πρόσημο.");
      return;
    }

    const selectedExistingId = normalizePositiveInt(draftSingerTuneId);
    if (
      selectedExistingId &&
      draftSingerTuneTitle &&
      draftSingerTuneTune &&
      normalizeTitleKey(cleanTitle) === normalizeTitleKey(draftSingerTuneTitle)
    ) {
      onChange({
        selectedTonicity: draftSingerTuneTune,
        selectedTonicitySign: draftSign,
        selectedSingerTuneId: selectedExistingId,
        selectedSingerTuneTitle: draftSingerTuneTitle,
        selectedSingerTuneTune: draftSingerTuneTune,
      });
      setOpen(false);
      return;
    }

    const existingRow = rowsByTitle.get(normalizeTitleKey(cleanTitle));
    if (existingRow) {
      const tone = normalizeTonicityValue(existingRow.tune);
      const singerTuneId = normalizePositiveInt(existingRow.id);
      const title = normalizeText(existingRow.title);

      if (!tone || !singerTuneId || !title) {
        setSingerRowsError("Η επιλεγμένη φωνή δεν έχει έγκυρο τόνο.");
        return;
      }

      onChange({
        selectedTonicity: tone,
        selectedTonicitySign: draftSign,
        selectedSingerTuneId: singerTuneId,
        selectedSingerTuneTitle: title,
        selectedSingerTuneTune: tone,
      });
      setOpen(false);
      return;
    }

    setSavingSinger(true);
    setSingerRowsError(null);

    try {
      const res = await fetch(`/api/songs/${currentSongId}/singer-tunes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          tune: draftTonicity,
          mentionUserIds: titleMentions.map((m) => m.userId),
        }),
        cache: "no-store",
      });
      const body = await readJson(res);

      if (!res.ok) {
        const message =
          (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
        throw new Error(String(message));
      }

      const singerTuneId = normalizePositiveInt((body as any)?.id ?? (body as any)?.data?.id);
      if (!singerTuneId) {
        throw new Error("Η αποθήκευση φωνής δεν επέστρεψε έγκυρο id.");
      }

      rememberPickedTitleUsers();
      onChange({
        selectedTonicity: draftTonicity,
        selectedTonicitySign: draftSign,
        selectedSingerTuneId: singerTuneId,
        selectedSingerTuneTitle: cleanTitle,
        selectedSingerTuneTune: draftTonicity,
      });
      setOpen(false);
    } catch (e: any) {
      setSingerRowsError(e?.message || "Αποτυχία αποθήκευσης φωνής");
    } finally {
      setSavingSinger(false);
    }
  }

  const buttonToneLabel = displayTonicity
    ? toneButtonLabel(displayTonicity, displaySign)
    : "Τόνος";
  const hasExplicitSelection = Boolean(
    selectedListTonicity ||
      selectedSingerTuneId,
  );
  const toneButtonsDisabled = !draftSign;
  const hasSingerRows = (singerRows?.length ?? 0) > 0;

  return (
    <>
      <button
        type="button"
        className={[
          "tone-current",
          hasExplicitSelection || forceExplicitStyle ? "explicit" : "",
          compact ? "compact" : "",
          buttonClassName,
        ].filter(Boolean).join(" ")}
        onClick={openPicker}
        disabled={disabled}
        title="Αλλαγή τόνου ή φωνής λίστας"
        aria-haspopup="dialog"
      >
        <span className="tone-current-main">{buttonToneLabel}</span>
        {showSingerInButton && selectedSingerTuneTitle ? (
          <span className="tone-current-sub">{selectedSingerTuneTitle}</span>
        ) : null}
      </button>

      {open ? (
        <div className="tone-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="tone-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Επιλογή τόνου και φωνής"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="tone-head">
              <strong>Επιλογή τόνου και φωνής</strong>
              <button
                type="button"
                className="tone-close"
                onClick={() => setOpen(false)}
                disabled={savingSinger}
                aria-label="Κλείσιμο"
              >
                ×
              </button>
            </div>

            <div className="tone-section">
              <div className="tone-section-title">Πρόσημο</div>
              <div className="tone-signs" aria-label="Πρόσημο">
                <button
                  type="button"
                  className={draftSign === "-" ? "selected" : ""}
                  onClick={() => {
                    setDraftSign("-");
                    setSingerRowsError(null);
                  }}
                >
                  -
                </button>
                <button
                  type="button"
                  className={draftSign === "+" ? "selected" : ""}
                  onClick={() => {
                    setDraftSign("+");
                    setSingerRowsError(null);
                  }}
                >
                  +
                </button>
              </div>

              {!draftSign ? (
                <div className="tone-hint">Για επιλογή τόνου ή φωνής χρειάζεται πρώτα πρόσημο.</div>
              ) : null}
            </div>

            {normalizedSingerSuggestions.length > 0 ? (
              <div className="tone-section">
                <div className="tone-section-title">Προτάσεις από τη λίστα</div>
                <div className="singer-row">
                  {normalizedSingerSuggestions.map((suggestion) => {
                    const matched = rowsByTitle.get(normalizeTitleKey(suggestion.title));
                    const suggestedTone = normalizeTonicityValue(suggestion.tune);
                    return (
                      <button
                        key={normalizeTitleKey(suggestion.title)}
                        type="button"
                        className="singer-chip"
                        onClick={() => applySuggestion(suggestion)}
                        title={
                          matched
                            ? "Επιλογή υπάρχουσας φωνής για αυτό το τραγούδι"
                            : "Συμπλήρωση τίτλου για νέα φωνή"
                        }
                      >
                        <span>{suggestion.title}</span>
                        {suggestedTone ? <b>{toneButtonLabel(suggestedTone, draftSign)}</b> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="tone-section">
              <div className="tone-section-title">Υπάρχουσες φωνές τραγουδιού</div>
              {singerRows === null ? (
                <div className="tone-muted">Φόρτωση…</div>
              ) : !hasSingerRows ? (
                <div className="tone-muted">Δεν υπάρχουν καταχωρήσεις για αυτό το τραγούδι.</div>
              ) : (
                <div className="singer-row">
                  {(singerRows ?? []).map((row) => {
                    const tone = normalizeTonicityValue(row.tune);
                    const isSelected =
                      normalizePositiveInt(draftSingerTuneId) === normalizePositiveInt(row.id);

                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={"singer-chip" + (isSelected ? " selected" : "")}
                        onClick={() => chooseSingerRow(row)}
                        disabled={!draftSign}
                        title="Επιλογή φωνής"
                      >
                        <span>{row.title}</span>
                        {tone ? <b>{toneButtonLabel(tone, draftSign)}</b> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="tone-section">
              <div className="tone-section-title">Τόνος χωρίς φωνή</div>
              <div className="tone-grid">
                <div className="tone-row tone-row-natural">
                  {NATURAL_TONICITIES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      disabled={toneButtonsDisabled}
                      className={draftTonicity === tone ? "selected" : ""}
                      onClick={() => chooseTone(tone)}
                    >
                      {toneButtonLabel(tone, draftSign)}
                    </button>
                  ))}
                </div>

                <div className="tone-row tone-row-sharp">
                  {SHARP_TONICITIES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      disabled={toneButtonsDisabled}
                      className={draftTonicity === tone ? "selected" : ""}
                      onClick={() => chooseTone(tone)}
                    >
                      {toneButtonLabel(tone, draftSign)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="tone-section">
              <div className="tone-section-title">Νέα φωνή ή τίτλος</div>
              <UserMentionsField
                value={formTitle}
                onChange={setFormTitle}
                mentions={titleMentions}
                onMentionsChange={setTitleMentions}
                placeholder="Γράψε χρήστη ή απλό τίτλο"
                disabled={savingSinger}
                multiline={false}
                minChars={2}
                take={8}
                showMentionLinks={false}
                initialSuggestions={mentionSuggestions}
                searchWithoutAt={true}
                dropdownFixed={true}
                onPickUser={onPickTitleUser}
              />
            </div>

            {singerRowsError ? <div className="tone-error">{singerRowsError}</div> : null}

            <div className="tone-actions">
              <button type="button" onClick={clearSelection} disabled={savingSinger}>
                Αρχικός
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={savingSinger}>
                Άκυρο
              </button>
              <button type="button" onClick={saveSelection} disabled={savingSinger}>
                {savingSinger ? "Αποθήκευση…" : "Αποθήκευση"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .tone-current {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 2px;
          min-width: 58px;
          max-width: 180px;
          min-height: 34px;
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: #181818;
          color: #fff;
          font-size: 0.95rem;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
        }

        .tone-current-main,
        .tone-current-sub {
          display: block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tone-current-sub {
          font-size: 0.72rem;
          font-weight: 700;
          opacity: 0.9;
        }

        .tone-current.explicit {
          border-color: rgba(255, 71, 71, 0.9);
          background: #ff4747;
        }

        .tone-current.compact {
          min-width: 54px;
          max-width: 92px;
          min-height: 30px;
          padding: 5px 8px;
          border-radius: 9px;
          font-size: 0.88rem;
        }

        .tone-current:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .tone-overlay {
          position: fixed;
          inset: 0;
          z-index: 2500;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.58);
        }

        .tone-dialog {
          width: min(640px, calc(100vw - 24px));
          max-height: min(86vh, 720px);
          overflow: auto;
          box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #0f0f0f;
          color: #fff;
          box-shadow: 0 18px 52px rgba(0, 0, 0, 0.42);
          padding: 14px;
        }

        .tone-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .tone-close {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #191919;
          color: #fff;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
        }

        .tone-section {
          display: grid;
          gap: 8px;
          margin-top: 12px;
        }

        .tone-section-title {
          color: rgba(255, 255, 255, 0.84);
          font-size: 0.86rem;
          font-weight: 800;
        }

        .tone-signs,
        .singer-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tone-signs button,
        .tone-row button,
        .tone-actions button,
        .singer-chip {
          border: 1px solid #666;
          background: linear-gradient(#242424, #111);
          color: #fff;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 800;
        }

        .tone-signs button {
          min-width: 48px;
          min-height: 38px;
          font-size: 1.15rem;
        }

        .tone-grid {
          display: grid;
          gap: 6px;
        }

        .tone-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .tone-row button {
          min-width: 52px;
          min-height: 34px;
          padding: 5px 8px;
          font-size: 1rem;
          white-space: nowrap;
        }

        .singer-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 34px;
          max-width: 100%;
          padding: 6px 10px;
          font-size: 0.92rem;
        }

        .singer-chip span {
          min-width: 0;
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .singer-chip b {
          flex: 0 0 auto;
        }

        .tone-signs button.selected,
        .tone-row button.selected,
        .singer-chip.selected {
          border-color: #ff4747;
          background: #ff4747;
        }

        .tone-row button:disabled,
        .singer-chip:disabled,
        .tone-actions button:disabled {
          opacity: 0.48;
          cursor: default;
        }

        .tone-hint,
        .tone-muted {
          color: rgba(255, 255, 255, 0.78);
          font-size: 0.9rem;
        }

        .tone-error {
          margin-top: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 80, 80, 0.38);
          background: rgba(255, 80, 80, 0.12);
          color: #fff;
          padding: 9px 10px;
          font-size: 0.9rem;
        }

        .tone-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 14px;
        }

        .tone-actions button {
          min-height: 34px;
          padding: 6px 10px;
        }

        :global(.tone-dialog .user-mentions-field input) {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
          border-radius: 10px !important;
          color: #000 !important;
          background: #fff !important;
        }

        @media (max-width: 520px) {
          .tone-overlay {
            align-items: flex-start;
            padding: 64px 6px 10px;
          }

          .tone-dialog {
            width: calc(100vw - 12px);
            max-height: calc(100vh - 84px);
            padding: 8px;
          }

          .tone-grid {
            gap: 5px;
          }

          .tone-row {
            gap: 4px;
          }

          .tone-row-natural {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 3px;
          }

          .tone-row-sharp {
            gap: 4px;
          }

          .tone-row button {
            min-width: 0;
            min-height: 32px;
            padding: 4px 3px;
            border-radius: 8px;
            font-size: clamp(0.76rem, 3.15vw, 0.86rem);
          }

          .singer-chip span {
            max-width: 190px;
          }
        }
      `}</style>
    </>
  );
}
