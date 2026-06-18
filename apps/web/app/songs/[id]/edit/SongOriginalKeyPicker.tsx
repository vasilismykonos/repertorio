"use client";

import React, { useEffect, useState } from "react";

import {
  TONICITY_VALUES,
  isValidTonicity,
  type TonicityValue,
} from "@/app/components/tonicity";

export type OriginalKeySign = "+" | "-";

type OriginalKeyValue = {
  originalKey: string | null;
  originalKeySign: OriginalKeySign | null;
};

type Props = {
  open: boolean;
  value: OriginalKeyValue;
  detected: OriginalKeyValue;
  onClose: () => void;
  onSave: (value: OriginalKeyValue) => void;
};

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

const NATURAL_TONICITIES = TONICITY_VALUES.filter((tone) => !tone.includes("#"));
const SHARP_TONICITIES = TONICITY_VALUES.filter((tone) => tone.includes("#"));

function normalizeSign(value: unknown): OriginalKeySign | null {
  return value === "+" || value === "-" ? value : null;
}

function codeToTonicity(value: unknown): TonicityValue | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const tone = ORIGINAL_KEY_TONICITIES[Math.trunc(n) - 101];
  return tone && isValidTonicity(tone) ? tone : null;
}

function tonicityToCode(value: TonicityValue | null): string | null {
  if (!value) return null;
  const idx = (ORIGINAL_KEY_TONICITIES as readonly string[]).indexOf(value);
  return idx >= 0 ? String(101 + idx) : null;
}

function toneLabel(tone: TonicityValue, sign: OriginalKeySign) {
  return `${tone}${sign}`;
}

export function originalKeyCodeToTonicityLabel(
  originalKey: string | null | undefined,
  sign: OriginalKeySign | null | undefined,
): string | null {
  const tone = codeToTonicity(originalKey);
  if (!tone) return null;
  return `${tone}${normalizeSign(sign) ?? ""}`;
}

export default function SongOriginalKeyPicker({
  open,
  value,
  detected,
  onClose,
  onSave,
}: Props) {
  const currentTone = codeToTonicity(value.originalKey);
  const detectedTone = codeToTonicity(detected.originalKey);
  const currentSign = normalizeSign(value.originalKeySign);
  const detectedSign = normalizeSign(detected.originalKeySign);

  const [draftTone, setDraftTone] = useState<TonicityValue | null>(
    currentTone ?? detectedTone,
  );
  const [draftSign, setDraftSign] = useState<OriginalKeySign>(
    currentSign ?? detectedSign ?? "+",
  );

  useEffect(() => {
    if (!open) return;
    setDraftTone(currentTone ?? detectedTone);
    setDraftSign(currentSign ?? detectedSign ?? "+");
  }, [currentSign, currentTone, detectedSign, detectedTone, open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const canSave = !!draftTone;

  function save() {
    if (!draftTone) return;
    onSave({
      originalKey: tonicityToCode(draftTone),
      originalKeySign: draftSign,
    });
  }

  function renderToneButton(tone: TonicityValue) {
    const selected = draftTone === tone;
    return (
      <button
        key={tone}
        type="button"
        className={`song-key-tone ${selected ? "is-selected" : ""}`}
        onClick={() => setDraftTone(tone)}
      >
        {toneLabel(tone, draftSign)}
      </button>
    );
  }

  return (
    <div
      className="song-key-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="song-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Επιλογή τονικότητας"
      >
        <style>{`
          .song-key-backdrop {
            position: fixed;
            inset: 0;
            z-index: 3000;
            background: rgba(0, 0, 0, 0.62);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
          }
          .song-key-dialog {
            width: min(520px, 100%);
            max-height: min(86vh, 620px);
            overflow: auto;
            border-radius: 12px;
            border: 1px solid #3a3a3a;
            background: #121212;
            color: #fff;
            box-shadow: 0 20px 55px rgba(0, 0, 0, 0.42);
            padding: 16px;
          }
          .song-key-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
          }
          .song-key-title {
            font-weight: 800;
            font-size: 18px;
            line-height: 1.25;
          }
          .song-key-sub {
            margin-top: 4px;
            color: rgba(255, 255, 255, 0.72);
            font-size: 13px;
            line-height: 1.35;
          }
          .song-key-close {
            border: 1px solid #444;
            border-radius: 8px;
            background: #1f1f1f;
            color: #fff;
            cursor: pointer;
            min-width: 34px;
            min-height: 34px;
            font-weight: 900;
          }
          .song-key-section {
            display: grid;
            gap: 8px;
            margin-top: 12px;
          }
          .song-key-label {
            color: rgba(255, 255, 255, 0.76);
            font-size: 13px;
            font-weight: 700;
          }
          .song-key-sign-row,
          .song-key-tone-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .song-key-sign,
          .song-key-tone {
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 34px;
            border-radius: 9px;
            border: 1px solid #555;
            background: linear-gradient(#242424, #151515);
            color: #fff;
            font-size: 16px;
            font-weight: 850;
            line-height: 1;
            padding: 7px 12px;
            white-space: nowrap;
            cursor: pointer;
          }
          .song-key-sign {
            min-width: 44px;
          }
          .song-key-tone.is-selected,
          .song-key-sign.is-selected {
            border-color: #ff4747;
            background: #ff4747;
            color: #fff;
          }
          .song-key-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 16px;
            flex-wrap: wrap;
          }
          .song-key-action {
            min-height: 36px;
            border-radius: 8px;
            border: 1px solid #555;
            color: #fff;
            background: #1f1f1f;
            padding: 7px 12px;
            cursor: pointer;
            font-weight: 800;
          }
          .song-key-action.primary {
            background: #0f766e;
            border-color: #14b8a6;
          }
          .song-key-action:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
          @media (max-width: 520px) {
            .song-key-backdrop {
              align-items: flex-end;
              padding: 10px;
            }
            .song-key-dialog {
              border-radius: 12px;
              padding: 14px;
            }
            .song-key-actions {
              justify-content: stretch;
            }
            .song-key-action {
              flex: 1 1 120px;
            }
          }
        `}</style>

        <div className="song-key-head">
          <div>
            <div className="song-key-title">Τονικότητα τραγουδιού</div>
            <div className="song-key-sub">
              {detectedTone
                ? `Αυτόματη πρόταση από τελευταία συγχορδία: ${toneLabel(
                    detectedTone,
                    detectedSign ?? "+",
                  )}`
                : "Διάλεξε τόνο και πρόσημο για το τραγούδι."}
            </div>
          </div>
          <button
            type="button"
            className="song-key-close"
            onClick={onClose}
            aria-label="Κλείσιμο"
            title="Κλείσιμο"
          >
            ×
          </button>
        </div>

        <div className="song-key-section">
          <div className="song-key-label">Πρόσημο</div>
          <div className="song-key-sign-row">
            {(["-", "+"] as const).map((sign) => (
              <button
                key={sign}
                type="button"
                className={`song-key-sign ${draftSign === sign ? "is-selected" : ""}`}
                onClick={() => setDraftSign(sign)}
              >
                {sign}
              </button>
            ))}
          </div>
        </div>

        <div className="song-key-section">
          <div className="song-key-label">Τόνος</div>
          <div className="song-key-tone-row">
            {NATURAL_TONICITIES.map(renderToneButton)}
          </div>
          <div className="song-key-tone-row">
            {SHARP_TONICITIES.map(renderToneButton)}
          </div>
        </div>

        <div className="song-key-actions">
          <button type="button" className="song-key-action" onClick={onClose}>
            Άκυρο
          </button>
          <button
            type="button"
            className="song-key-action primary"
            disabled={!canSave}
            onClick={save}
          >
            Αποθήκευση επιλογής
          </button>
        </div>
      </div>
    </div>
  );
}
