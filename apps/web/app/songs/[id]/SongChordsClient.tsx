"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import {
  TONICITY_VALUES,
  isValidTonicity,
} from "@/app/components/tonicity/index";

type SongChordsClientProps = {
  songId?: number | null;
  chords: string | null;
  canEdit?: boolean;
  characteristics?: string | null;
  originalKey?: string | null; // π.χ. "103"
  originalKeySign?: "+" | "-" | null;
  urlTonicity?: string | null;
  urlTonicitySign?: "+" | "-" | null;
};

const CHORDS = [
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

const CHORDS_SMALL = CHORDS.map((c) => c.toLowerCase()) as string[];

const NATURAL_TONICITIES = TONICITY_VALUES.filter((v) => !v.includes("#"));
const SHARP_TONICITIES = TONICITY_VALUES.filter((v) => v.includes("#"));

const CHORD_INDEX_MAP: Record<string, number> = Object.fromEntries(
  CHORDS.map((chord, index) => [chord, index])
);

const CHORD_INDEX_MAP_SMALL: Record<string, number> = Object.fromEntries(
  CHORDS_SMALL.map((chord, index) => [chord, index])
);

const CHORDS_SCALE_STORAGE_KEY = "repertorio_chords_scale_v1";
const ROOM_PENDING_TONICITY_STORAGE_PREFIX = "rep_room_pending_tonicity::";
const CHORDS_BASE_FONT_SIZE = 14;
const CHORDS_SCALE_MIN = 0.75;
const CHORDS_SCALE_MAX = 2.2;

const NOTE_TOKEN_REGEX =
  /(Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι|ντο#?|ρε#?|μι|φα#?|σολ#?|λα#?|σι)/g;

type ParsedChord = {
  raw: string;
  root: string;
  sign: "+" | "-" | null;
  hasSeven: boolean;
  degree: string;
  interval: number;
};

type HarmonyAnalysis = {
  tonic: string | null;
  tonicSign: "+" | "-" | null;
  confidence: number;
  road: string;
  alternatives: Array<{ road: string; confidence: number }>;
  possibleRoads: Array<{ road: string; confidence: number; reason: string }>;
  unlikelyRoads: Array<{ road: string; reason: string }>;
  chordCount: number;
  uniqueDegrees: string[];
  progression: string;
  evidence: string[];
  playerTips: string[];
  warning: string | null;
  elapsedMs: number;
};

type RoadVoteSummary = {
  songId: number;
  selectedRoad?: string | null;
  characteristics?: string | null;
  totals: Array<{ road: string; votes: number; score: number; averageConfidence: number }>;
  myVote: { id: number; road: string; confidence: number; note: string | null; updatedAt: string } | null;
  recentVotes: Array<{
    id: number;
    road: string;
    confidence: number;
    updatedAt: string;
    user: { id: number; displayName: string | null; username: string | null } | null;
  }>;
};

const CHORD_TOKEN_REGEX =
  /((?:Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)|(?:ντο#?|ρε#?|μι|φα#?|σολ#?|λα#?|σι))([+-]?)(7?)/g;

const DEGREE_BY_INTERVAL_MAJOR: Record<number, string> = {
  0: "I",
  1: "bII",
  2: "II",
  3: "bIII",
  4: "III",
  5: "IV",
  6: "bV",
  7: "V",
  8: "bVI",
  9: "VI",
  10: "bVII",
  11: "VII",
};

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

function clampScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(CHORDS_SCALE_MAX, Math.max(CHORDS_SCALE_MIN, value));
}

function distance2(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function originalKeyCodeStringToBaseChord(codeStr: string | null | undefined): string | null {
  const s = (codeStr ?? "").trim();
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  const code = Math.trunc(n);
  const idx = code - 101; // 101=Ντο ... 112=Σι

  if (idx < 0 || idx >= CHORDS.length) return null;
  return CHORDS[idx] ?? null;
}

function baseChordToOriginalKeyCode(chord: string | null | undefined): string | null {
  if (!chord) return null;
  const index = CHORD_INDEX_MAP[chord];
  if (index === undefined) return null;
  return String(index + 101);
}

function normalizeGreekChordName(name: string): string | null {
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

function normalizeTonicityInput(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const raw = input.trim();
  if (!raw) return null;

  const match = raw.match(/(Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)/i);
  if (!match) return null;

  return normalizeGreekChordName(match[1] ?? "");
}

function detectLastChordAndSign(
  chords: string | null
): { baseChord: string | null; sign: "+" | "-" | null } {
  const text = chords ?? "";
  if (!text) return { baseChord: null, sign: null };

  const regex = /((Ντο#?|Ρε#?|Μι|Φα#?|Σολ#?|Λα#?|Σι)|(ντο#?|ρε#?|μι|φα#?|σολ#?|λα#?|σι))([+-]?)/g;

  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;

  while ((match = regex.exec(text)) !== null) {
    last = match;
  }

  if (!last) return { baseChord: null, sign: null };

  const chordToken = last[1] ?? "";
  const signToken = last[4] ?? "";

  const normalized = normalizeGreekChordName(chordToken);
  if (!normalized) return { baseChord: null, sign: null };

  const sign: "+" | "-" | null =
    signToken === "+" ? "+" : signToken === "-" ? "-" : null;

  return { baseChord: normalized, sign };
}

function transposeChordToken(token: string, offset: number): string {
  const isLower = token === token.toLowerCase();
  const index = isLower ? CHORD_INDEX_MAP_SMALL[token] : CHORD_INDEX_MAP[token];

  if (index === undefined) return token;

  const nextIndex = (index + offset + 12) % 12;
  return isLower ? CHORDS_SMALL[nextIndex] : CHORDS[nextIndex];
}

function transportChords(originalChord: string, targetChord: string, chordsContent: string): string {
  const originalIndex =
    CHORD_INDEX_MAP[originalChord] ?? CHORD_INDEX_MAP_SMALL[originalChord];
  const targetIndex =
    CHORD_INDEX_MAP[targetChord] ?? CHORD_INDEX_MAP_SMALL[targetChord];

  if (
    originalIndex === undefined ||
    targetIndex === undefined ||
    Number.isNaN(originalIndex) ||
    Number.isNaN(targetIndex)
  ) {
    return chordsContent;
  }

  const offset = targetIndex - originalIndex;

  return chordsContent.replace(NOTE_TOKEN_REGEX, (token) => {
    return transposeChordToken(token, offset);
  });
}

function colorizeChords(chords: string): string {
  if (!chords) return "";
  return chords.replace(/(\[[^\]]+\])/g, '<span class="SpTune">$1</span>');
}

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

function cleanRoadName(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/^Δρόμος\s*[:：]\s*/i, "")
    .replace(/^Μακάμ\s*[:：]\s*/i, "")
    .trim();
}

function chordRootIndex(root: string | null | undefined): number | null {
  if (!root) return null;
  const normalized = normalizeGreekChordName(root);
  if (!normalized) return null;
  const index = CHORD_INDEX_MAP[normalized];
  return Number.isInteger(index) ? index : null;
}

function degreeLabel(interval: number, sign: "+" | "-" | null, hasSeven: boolean) {
  const base = DEGREE_BY_INTERVAL_MAJOR[(interval + 12) % 12] || "?";
  return `${base}${sign === "-" ? "m" : sign === "+" ? "" : ""}${hasSeven ? "7" : ""}`;
}

function parseChordTokens(text: string, tonic: string | null): ParsedChord[] {
  const tonicIndex = chordRootIndex(tonic);
  const parsed: ParsedChord[] = [];
  let match: RegExpExecArray | null;
  CHORD_TOKEN_REGEX.lastIndex = 0;

  while ((match = CHORD_TOKEN_REGEX.exec(text)) !== null) {
    const root = normalizeGreekChordName(match[1] || "");
    if (!root) continue;
    const rootIndex = chordRootIndex(root);
    if (rootIndex == null || tonicIndex == null) continue;
    const sign = match[2] === "+" ? "+" : match[2] === "-" ? "-" : null;
    const hasSeven = match[3] === "7";
    const interval = (rootIndex - tonicIndex + 12) % 12;
    parsed.push({
      raw: `${root}${sign ?? ""}${hasSeven ? "7" : ""}`,
      root,
      sign,
      hasSeven,
      interval,
      degree: degreeLabel(interval, sign, hasSeven),
    });
  }

  return parsed;
}

function countBy<T extends string | number>(items: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return map;
}

function hasDegree(chords: ParsedChord[], interval: number, sign?: "+" | "-" | null) {
  return chords.some((chord) => chord.interval === interval && (sign === undefined || chord.sign === sign));
}

function hasMotion(chords: ParsedChord[], fromInterval: number, toInterval: number) {
  for (let i = 0; i < chords.length - 1; i += 1) {
    if (chords[i]?.interval === fromInterval && chords[i + 1]?.interval === toInterval) return true;
  }
  return false;
}

function countMotion(chords: ParsedChord[], fromInterval: number, toInterval: number) {
  let count = 0;
  for (let i = 0; i < chords.length - 1; i += 1) {
    if (chords[i]?.interval === fromInterval && chords[i + 1]?.interval === toInterval) count += 1;
  }
  return count;
}

function countInterval(chords: ParsedChord[], interval: number) {
  return chords.filter((chord) => chord.interval === interval).length;
}

function intervalShare(chords: ParsedChord[], interval: number) {
  if (!chords.length) return 0;
  return countInterval(chords, interval) / chords.length;
}

function hasAnyInterval(chords: ParsedChord[], intervals: number[]) {
  return intervals.some((interval) => hasDegree(chords, interval));
}

function repeatedDegreePairs(chords: ParsedChord[]) {
  const pairs = new Map<string, number>();
  for (let i = 0; i < chords.length - 1; i += 1) {
    const a = chords[i]?.degree;
    const b = chords[i + 1]?.degree;
    if (!a || !b || a === b) continue;
    const key = `${a} → ${b}`;
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  return Array.from(pairs.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "el-GR"))
    .slice(0, 3)
    .map(([pair, count]) => `${pair} (${count})`);
}

function scoreHarmonyRoads(chords: ParsedChord[], tonicSign: "+" | "-" | null) {
  const scores = new Map<string, number>();
  const add = (road: string, points: number) => scores.set(road, (scores.get(road) || 0) + points);
  const penalize = (roadPattern: RegExp, points: number) => {
    for (const [road, score] of Array.from(scores.entries())) {
      if (roadPattern.test(road)) scores.set(road, score - points);
    }
  };

  const tonicMajor = tonicSign === "+" ? true : tonicSign === "-" ? false : hasDegree(chords, 0, "+");
  const tonicMinor = tonicSign === "-" ? true : tonicSign === "+" ? false : hasDegree(chords, 0, "-");
  const bII = hasDegree(chords, 1);
  const bIIMajor = hasDegree(chords, 1, "+") || hasDegree(chords, 1, null);
  const iiMajor = hasDegree(chords, 2, "+") || chords.some((chord) => chord.interval === 2 && chord.hasSeven);
  const bIII = hasDegree(chords, 3);
  const bIIIMajor = hasDegree(chords, 3, "+") || hasDegree(chords, 3, null);
  const iiiMajor = hasDegree(chords, 4, "+") || hasDegree(chords, 4, null);
  const ivMajor = hasDegree(chords, 5, "+") || hasDegree(chords, 5, null);
  const ivMinor = hasDegree(chords, 5, "-");
  const bV = hasDegree(chords, 6);
  const vMajor = hasDegree(chords, 7, "+") || chords.some((chord) => chord.interval === 7 && chord.hasSeven);
  const vMinor = hasDegree(chords, 7, "-");
  const bVI = hasDegree(chords, 8);
  const viMajor = hasDegree(chords, 9, "+") || hasDegree(chords, 9, null);
  const bVII = hasDegree(chords, 10);
  const bVIIMinor = hasDegree(chords, 10, "-");
  const tonicCadence = countMotion(chords, 7, 0) + countMotion(chords, 1, 0) + countMotion(chords, 10, 0);
  const tonicWeight = intervalShare(chords, 0);

  if (tonicMajor) add("Ματζόρε", 18);
  if (tonicMinor) add("Μινόρε", 18);
  if (tonicWeight > 0.2) {
    if (tonicMajor) add("Ματζόρε", 8);
    if (tonicMinor) add("Μινόρε", 8);
  }

  if (tonicMajor && !bII && (ivMajor || vMajor)) add("Ραστ / Ματζόρε", 34);
  if (tonicMajor && bVII && !bII) add("Ραστ", 18);
  if (tonicMajor && iiiMajor && !bII) add("Ραστ", 10);

  if (tonicMajor && bIIMajor) add("Χιτζάζ / Χιτζασκιάρ", 42);
  if (tonicMajor && bIIMajor && hasMotion(chords, 1, 0)) add("Χιτζάζ / Χιτζασκιάρ", 18);
  if (tonicMajor && bIIMajor && ivMinor) add("Χιτζασκιάρ", 18);
  if (tonicMajor && bIIMajor && bIII) add("Χιτζασκιάρ", 10);
  if (tonicMajor && bIIMajor && iiMajor) add("Χιτζασκιάρ", 10);
  if (tonicMajor && bVIIMinor && !tonicMinor) add("Χιτζάζ", 22);
  if (tonicMajor && bVIIMinor && tonicWeight > 0.35) add("Χιτζάζ", 12);
  if (bIIMajor && !tonicMajor && tonicMinor) add("Χιτζάζ", 18);

  if (tonicMinor && vMajor) add("Νιαβέντ / Αρμονικό μινόρε", 30);
  if (tonicMinor && vMajor && bVI) add("Νιαβέντ", 18);
  if (tonicMinor && vMajor && bIIIMajor) add("Νιαβέντ", 12);
  if (tonicMinor && bIIIMajor && bVII && ivMinor) add("Μινόρε", 34);
  if (tonicMinor && bIIIMajor && bVII && !bII) add("Διατονικό Μινόρε", 26);
  if (tonicMinor && bIIIMajor && bVII && vMajor && !bII) add("Αρμονικό Μινόρε", 18);

  if (tonicMinor && bII && bVII && !vMajor) add("Κιουρδί", 34);
  if (tonicMinor && bII && !vMajor) add("Κιουρδί", 18);
  if (tonicMinor && bII && vMinor) add("Κιουρδί", 10);

  if (tonicMinor && !bII && (bVII || ivMinor || vMinor)) add("Ουσάκ", 26);
  if (tonicMinor && bVII && !vMajor) add("Ουσάκ", 14);
  if (tonicMinor && ivMinor && !vMajor && !bII) add("Ουσάκ", 12);

  if (tonicMinor && bII && ivMinor) add("Σαμπάχ", 24);
  if (tonicMinor && bII && bVI) add("Σαμπάχ", 12);

  if (tonicMinor && iiMajor) add("Νικρίζ", 22);
  if (tonicMinor && iiMajor && vMajor) add("Νικρίζ", 14);
  if (tonicMinor && bV) add("Νικρίζ", 10);

  if ((tonicMajor || tonicMinor) && bII && bVI && bVII) add("Σουζινάκ", 16);
  if (hasAnyInterval(chords, [3, 4]) && bVI && !tonicMajor) add("Χουζάμ / Σεγκιάχ", 14);
  if (tonicCadence >= 2) {
    if (tonicMajor) add("Ραστ / Ματζόρε", 6);
    if (tonicMinor) add("Μινόρε", 6);
  }

  if (tonicSign === "-") {
    penalize(/^(Ραστ|Ματζόρε|Ραστ \/ Ματζόρε)$/i, 80);
  }
  if (tonicSign === "+") {
    penalize(/^(Μινόρε|Διατονικό Μινόρε|Αρμονικό Μινόρε|Ουσάκ|Κιουρδί|Σαμπάχ)$/i, 80);
  }
  if (!bII) {
    penalize(/Σαμπάχ/i, 28);
    if (!tonicMajor) penalize(/Χιτζάζ/i, 18);
  }
  if (bII && tonicMinor) {
    penalize(/^(Ραστ|Ματζόρε|Ραστ \/ Ματζόρε)$/i, 40);
  }

  return Array.from(scores.entries())
    .filter(([, score]) => score > 0)
    .map(([road, score]) => ({ road, score }))
    .sort((a, b) => b.score - a.score || a.road.localeCompare(b.road, "el-GR"));
}

function roadKey(value: string) {
  return cleanRoadName(value)
    .toLocaleLowerCase("el-GR")
    .replace(/\s*\/\s*/g, "/")
    .trim();
}

function roadMatches(candidate: string, selected: string) {
  const candidateKey = roadKey(candidate);
  const selectedKey = roadKey(selected);
  if (!candidateKey || !selectedKey) return false;
  return candidateKey === selectedKey || candidateKey.split("/").some((part) => part.trim() === selectedKey);
}

function buildRoadLikelihoods(
  scores: Array<{ road: string; score: number }>,
  maxScore: number,
  confidence: number,
  selectedRoad: string,
  parsed: ParsedChord[],
  tonicSign: "+" | "-" | null,
) {
  const possible = scores.slice(0, 6).map((item, index) => ({
    road: item.road,
    confidence: Math.max(8, Math.min(96, Math.round((item.score / Math.max(1, maxScore)) * confidence))),
    reason: index === 0 ? "ταιριάζει περισσότερο με τις συγχορδίες" : "υπάρχουν κοινά αρμονικά στοιχεία",
  }));

  if (selectedRoad && !possible.some((item) => roadMatches(item.road, selectedRoad))) {
    possible.unshift({
      road: selectedRoad,
      confidence: Math.max(90, confidence),
      reason: "είναι ήδη επιλεγμένος/αποθηκευμένος, άρα χρησιμοποιείται ως σωστή βάση",
    });
  } else if (selectedRoad) {
    possible.forEach((item) => {
      if (roadMatches(item.road, selectedRoad)) {
        item.confidence = Math.max(item.confidence, 92);
        item.reason = "είναι ήδη επιλεγμένος/αποθηκευμένος, άρα χρησιμοποιείται ως σωστή βάση";
      }
    });
  }

  const hasMinorTonic = tonicSign === "-" || hasDegree(parsed, 0, "-");
  const hasMajorTonic = tonicSign === "+" || hasDegree(parsed, 0, "+");
  const hasFlatTwo = hasDegree(parsed, 1);
  const hasFlatSix = hasDegree(parsed, 8);
  const hasMinorFour = hasDegree(parsed, 5, "-");
  const alreadyPossible = new Set(possible.flatMap((item) => item.road.split("/").map((part) => roadKey(part))));
  const unlikely: Array<{ road: string; reason: string }> = [];
  const addUnlikely = (road: string, reason: string) => {
    if (selectedRoad && roadMatches(road, selectedRoad)) return;
    if (alreadyPossible.has(roadKey(road))) return;
    if (!unlikely.some((item) => roadMatches(item.road, road))) unlikely.push({ road, reason });
  };

  if (!hasMinorTonic) addUnlikely("Σαμπάχ", "θέλει μινόρε βάση και χαρακτηριστικό bII/χρώμα, εδώ η επιλεγμένη βάση είναι ματζόρε");
  else if (!hasFlatTwo && !hasFlatSix && !hasMinorFour) addUnlikely("Σαμπάχ", "λείπουν τα βασικά bII/bVI/iv μινόρε στοιχεία");
  if (hasMajorTonic && !hasFlatTwo) addUnlikely("Κιουρδί", "συνήθως χρειάζεται μινόρε βάση με χαμηλωμένη δεύτερη");
  if (hasMinorTonic && !hasFlatTwo) addUnlikely("Χιτζάζ", "δεν φαίνεται η χαρακτηριστική χαμηλωμένη δεύτερη στις συγχορδίες");
  if (hasFlatTwo && hasMinorTonic) addUnlikely("Ραστ / Ματζόρε", "το bII και η μινόρε βάση απομακρύνουν το απλό ματζόρε/ραστ");

  return {
    possibleRoads: possible.slice(0, 6),
    unlikelyRoads: unlikely.slice(0, 5),
  };
}

function applyTrustedRoadScore(scores: Array<{ road: string; score: number }>, selectedRoad: string) {
  if (!selectedRoad) return scores;
  const existing = scores.find((item) => roadMatches(item.road, selectedRoad));
  if (existing) {
    existing.score += 90;
    return scores.sort((a, b) => b.score - a.score || a.road.localeCompare(b.road, "el-GR"));
  }
  return [{ road: selectedRoad, score: Math.max(90, scores[0]?.score || 1) + 20 }, ...scores];
}

function analyzeHarmony(
  chordsText: string,
  tonic: string | null,
  tonicSign: "+" | "-" | null,
  selectedRoadInput?: string | null,
): HarmonyAnalysis {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const parsed = parseChordTokens(chordsText, tonic);
  const selectedRoad = cleanRoadName(selectedRoadInput);
  const warning =
    parsed.length < 4
      ? "Οι συγχορδίες είναι λίγες, οπότε η ανάλυση έχει χαμηλή βεβαιότητα."
    : parsed.length < 8
        ? "Η ανάλυση βασίζεται σε μικρό αριθμό συγχορδιών."
        : "Οι δρόμοι δεν αποδεικνύονται μόνο από συγχορδίες. Η μελωδική πορεία και οι στάσεις είναι απαραίτητες για σίγουρο συμπέρασμα.";

  if (!tonic || parsed.length === 0) {
    return {
      tonic,
      tonicSign,
      confidence: 0,
      road: "Δεν υπάρχει αρκετή πληροφορία",
      alternatives: [],
      possibleRoads: selectedRoad
        ? [{ road: selectedRoad, confidence: 90, reason: "είναι ήδη επιλεγμένος/αποθηκευμένος" }]
        : [],
      unlikelyRoads: [],
      chordCount: 0,
      uniqueDegrees: [],
      progression: "",
      evidence: ["Δεν εντοπίστηκε καθαρό τονικό κέντρο ή αναγνώσιμες συγχορδίες."],
      playerTips: [],
      warning,
      elapsedMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
    };
  }

  const scores = applyTrustedRoadScore(scoreHarmonyRoads(parsed, tonicSign), selectedRoad);
  const top = scores[0] || { road: "Απροσδιόριστο", score: 1 };
  const maxScore = Math.max(1, top.score);
  const secondScore = Math.max(0, scores[1]?.score || 0);
  const separationBonus = Math.min(12, Math.max(0, maxScore - secondScore));
  const ambiguityPenalty = secondScore > maxScore * 0.7 ? 12 : secondScore > maxScore * 0.5 ? 6 : 0;
  const intervalVariety = new Set(parsed.map((chord) => chord.interval)).size;
  const confidencePenalty = parsed.length < 8 ? 26 : parsed.length < 16 ? 14 : 8;
  const varietyPenalty = intervalVariety < 3 ? 18 : intervalVariety < 5 ? 8 : 0;
  const confidenceCap = selectedRoad ? 94 : parsed.length < 8 ? 56 : intervalVariety < 4 ? 62 : 78;
  const confidence = Math.max(
    18,
    Math.min(
      confidenceCap,
      Math.round(maxScore * 1.15 + separationBonus) - confidencePenalty - ambiguityPenalty - varietyPenalty,
    ),
  );
  const trustedConfidence = selectedRoad ? Math.max(confidence, 92) : confidence;
  const degreeCounts = countBy(parsed.map((chord) => chord.degree));
  const uniqueDegrees = Array.from(degreeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([degree, count]) => `${degree} (${count})`);

  const compactProgression: string[] = [];
  for (const chord of parsed) {
    if (compactProgression[compactProgression.length - 1] !== chord.degree) compactProgression.push(chord.degree);
  }
  const repeatedPairs = repeatedDegreePairs(parsed);
  const bIIToTonicCount = countMotion(parsed, 1, 0);
  const dominantToTonicCount = countMotion(parsed, 7, 0);

  const evidence: string[] = [];
  if (selectedRoad) evidence.push(`Ο επιλεγμένος/αποθηκευμένος δρόμος είναι ${selectedRoad}, οπότε θεωρείται σωστή βάση για την ανάλυση.`);
  if (hasDegree(parsed, 0, "+")) evidence.push(`Η τονική ${tonic}+ εμφανίζεται ως κέντρο/επιστροφή.`);
  if (hasDegree(parsed, 0, "-")) evidence.push(`Η τονική ${tonic}- εμφανίζεται ως κέντρο/επιστροφή.`);
  if (hasDegree(parsed, 1)) evidence.push("Υπάρχει bII, δηλαδή η χαμηλωμένη δεύτερη βαθμίδα, που δίνει έντονο ανατολικό χρώμα.");
  if (bIIToTonicCount) evidence.push(`Η κίνηση bII -> I εμφανίζεται ${bIIToTonicCount} φορά/ές και είναι πολύ χαρακτηριστική για χιτζασκιάρικο/χιτζάζικο περιβάλλον.`);
  if (dominantToTonicCount) evidence.push(`Υπάρχει λύση V -> I ${dominantToTonicCount} φορά/ές, άρα υπάρχει και λειτουργική επιστροφή στην τονική.`);
  if (hasDegree(parsed, 10)) evidence.push("Η bVII μπορεί να δείχνει ουσάκ/τροπική συμπεριφορά, ειδικά όταν λείπει έντονη δεσπόζουσα.");
  if (hasDegree(parsed, 8)) evidence.push("Η bVI μαζί με μινόρε τονική ή δεσπόζουσα παραπέμπει συχνά σε νιαβέντ/αρμονικό μινόρε περιβάλλον.");
  if (hasDegree(parsed, 5, "-")) evidence.push("Η iv μινόρε προσθέτει τροπικό χρώμα και δεν δείχνει απλό ματζόρε.");
  if (hasDegree(parsed, 3)) evidence.push("Η bIII χρησιμοποιείται ως χρωματικό/τροπικό άνοιγμα.");
  if (parsed.some((chord) => chord.interval === 7 && chord.hasSeven)) evidence.push("Υπάρχει V7, άρα λειτουργεί και δυτική ένταση προς την τονική.");
  if (parsed.some((chord) => chord.interval === 2 && chord.hasSeven)) evidence.push("Το II7 λειτουργεί σαν περαστική χρωματική ένταση.");
  if (repeatedPairs.length) evidence.push(`Επαναλαμβανόμενες κινήσεις: ${repeatedPairs.join(" · ")}.`);
  evidence.push("Προσοχή: από τις συγχορδίες βγαίνει ένδειξη δρόμου, όχι τελική απόδειξη χωρίς τη μελωδία.");
  if (!evidence.length) evidence.push("Η ανάλυση βασίζεται στην κατανομή των βαθμίδων και στις επαναλαμβανόμενες επιστροφές στην τονική.");

  const playerTips: string[] = [];
  if (top.road.includes("Χιτζασκιάρ")) {
    playerTips.push(`Σκέψου το ${tonic}+ ως σπίτι, αλλά όχι σαν απλό ματζόρε.`);
    playerTips.push("Τόνισε τη σχέση bII -> I, γιατί εκεί βρίσκεται το βασικό χρώμα.");
    playerTips.push("Κράτα τις περαστικές συγχορδίες ως ένταση που επιστρέφει στην τονική.");
  } else if (top.road.includes("Χιτζάζ")) {
    playerTips.push("Πρόσεξε το bII και τη λύση του προς την τονική.");
    playerTips.push("Μην το παίξεις σαν απλό μινόρε, το χρώμα είναι στο χαμηλωμένο δεύτερο σκαλί.");
  } else if (top.road.includes("Μινόρε") || top.road.includes("Νιαβέντ")) {
    playerTips.push("Κράτα καθαρή την αίσθηση της μινόρε τονικής.");
    playerTips.push("Η δεσπόζουσα και η iv δείχνουν πού πρέπει να χτιστεί η ένταση.");
  } else {
    playerTips.push("Χρησιμοποίησε τις συχνότερες βαθμίδες ως οδηγό για συνοδεία και αυτοσχεδιασμό.");
  }

  return {
    tonic,
    tonicSign,
    confidence: trustedConfidence,
    road: top.road,
    alternatives: scores
      .filter((item) => item.road !== top.road)
      .slice(0, 3)
      .map((item) => ({ road: item.road, confidence: Math.max(5, Math.min(80, Math.round((item.score / maxScore) * trustedConfidence))) })),
    ...buildRoadLikelihoods(scores, maxScore, trustedConfidence, selectedRoad, parsed, tonicSign),
    chordCount: parsed.length,
    uniqueDegrees,
    progression: compactProgression.slice(0, 18).join(" → "),
    evidence: evidence.slice(0, 6),
    playerTips,
    warning,
    elapsedMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
  };
}

function dispatchTonicityChanged(detail: {
  tonicity: string | null;
  sign: "+" | "-" | null;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rep:tonicityChanged", { detail }));
}

export default function SongChordsClient({
  songId,
  chords,
  canEdit = false,
  characteristics,
  originalKey,
  originalKeySign,
  urlTonicity,
  urlTonicitySign,
}: SongChordsClientProps) {
  const chordsBlockRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ dist0: number; scale0: number; active: boolean } | null>(null);
  const analysisCacheRef = useRef<Map<string, HarmonyAnalysis>>(new Map());

  const [baseChord, setBaseChord] = useState<string | null>(null);
  const [lastSign, setLastSign] = useState<"+" | "-" | null>(null);
  const [selectedTonicity, setSelectedTonicity] = useState<string | null>(null);
  const [currentChords, setCurrentChords] = useState(chords ?? "");
  const [chordsScale, setChordsScale] = useState(1);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [harmonyAnalysis, setHarmonyAnalysis] = useState<HarmonyAnalysis | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editChords, setEditChords] = useState(chords ?? "");
  const [editBaseChord, setEditBaseChord] = useState<string | null>(null);
  const [editBaseSource, setEditBaseSource] = useState<"stored" | "detected" | "manual" | "empty">("empty");
  const [editSign, setEditSign] = useState<"+" | "-" | null>(
    originalKeySign === "-" ? "-" : originalKeySign === "+" ? "+" : null,
  );
  const [currentCharacteristics, setCurrentCharacteristics] = useState(characteristics ?? "");
  const [editMakam, setEditMakam] = useState(extractMakamFromCharacteristics(characteristics));
  const [editAnalysis, setEditAnalysis] = useState<HarmonyAnalysis | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [roadVotes, setRoadVotes] = useState<RoadVoteSummary | null>(null);
  const [roadVotesLoading, setRoadVotesLoading] = useState(false);
  const [roadVoteSaving, setRoadVoteSaving] = useState(false);
  const [roadVoteError, setRoadVoteError] = useState<string | null>(null);
  const [roadVoteDraft, setRoadVoteDraft] = useState("");
  const [roadVoteConfidence, setRoadVoteConfidence] = useState(3);
  const [roadVoteOpen, setRoadVoteOpen] = useState(false);

  function applySelectedTonicity(input: unknown) {
    const normalized = normalizeTonicityInput(input);
    if (!normalized) return;
    if (!isValidTonicity(normalized)) return;

    setSelectedTonicity(normalized);

    if (typeof window !== "undefined") {
      (window as any).__repSelectedTonicity = normalized;
    }

    dispatchTonicityChanged({
      tonicity: normalized,
      sign: lastSign,
    });
  }

  useEffect(() => {
    const nextChords = chords ?? "";
    setCurrentChords(nextChords);
    setEditChords(nextChords);
    let initBase: string | null = null;
    let initSign: "+" | "-" | null = null;
    let initSource: "stored" | "detected" | "manual" | "empty" = "empty";

    const fromDbBase = originalKeyCodeStringToBaseChord(originalKey);
    const fromDbSign =
      originalKeySign === "+" || originalKeySign === "-" ? originalKeySign : null;

    if (fromDbBase) {
      initBase = fromDbBase;
      initSign = fromDbSign;
      initSource = "stored";
    }

    if (!initBase || initSign == null) {
      const auto = detectLastChordAndSign(nextChords);

      if (!initBase && auto.baseChord) {
        initBase = auto.baseChord;
        initSource = "detected";
      }
      if (initSign == null && auto.sign) initSign = auto.sign;
    }

    setBaseChord(initBase);
    setLastSign(initSign);
    setEditBaseChord(initBase);
    setEditBaseSource(initSource);
    setEditSign(initSign);

    let initialSelected = initBase;

    const fromUrl = normalizeTonicityInput(urlTonicity);
    const fromUrlSign =
      urlTonicitySign === "+" || urlTonicitySign === "-" ? urlTonicitySign : null;
    if (fromUrl && isValidTonicity(fromUrl)) {
      initialSelected = fromUrl;
      if (fromUrlSign) initSign = fromUrlSign;
    } else if (typeof window !== "undefined" && songId) {
      try {
        const key = `${ROOM_PENDING_TONICITY_STORAGE_PREFIX}${songId}`;
        const raw = window.sessionStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const pending = normalizeTonicityInput(parsed?.tonicity);
          if (pending && isValidTonicity(pending)) initialSelected = pending;
          window.sessionStorage.removeItem(key);
        }
      } catch {
        // ignore stale or malformed pending room tonicity
      }
    }

    if (typeof window !== "undefined") {
      (window as any).__repSelectedTonicity = initialSelected;
    }

    setSelectedTonicity(initialSelected);

    dispatchTonicityChanged({
      tonicity: initialSelected,
      sign: initSign,
    });
  }, [chords, originalKey, originalKeySign, songId, urlTonicity, urlTonicitySign]);

  useEffect(() => {
    const next = characteristics ?? "";
    setCurrentCharacteristics(next);
    setEditMakam(extractMakamFromCharacteristics(next));
  }, [characteristics]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const w = window as any;

    w.__repSetSelectedTonicity = (tonicity: unknown) => {
      applySelectedTonicity(tonicity);
    };

    return () => {
      try {
        delete w.__repSetSelectedTonicity;
      } catch {
        w.__repSetSelectedTonicity = undefined;
      }
    };
  }, [lastSign]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onRoomTonicity = (event: Event) => {
      const detail = (event as CustomEvent<{ tonicity?: string | null }>).detail;
      applySelectedTonicity(detail?.tonicity);
    };

    window.addEventListener("rep:roomsApplyTonicity", onRoomTonicity as EventListener);
    return () => {
      window.removeEventListener("rep:roomsApplyTonicity", onRoomTonicity as EventListener);
    };
  }, [lastSign]);

  const transportedChordsText = useMemo(() => {
    if (!currentChords || currentChords.trim() === "") return "";
    if (!baseChord || !selectedTonicity) return currentChords;

    return transportChords(baseChord, selectedTonicity, currentChords);
  }, [currentChords, baseChord, selectedTonicity]);

  const renderedChordsHtml = useMemo(() => {
    return colorizeChords(transportedChordsText);
  }, [transportedChordsText]);

  const analysisKey = useMemo(() => {
    const tonic = selectedTonicity || baseChord || "";
    const road = extractMakamFromCharacteristics(currentCharacteristics);
    return `${tonic}|${lastSign || ""}|${road}|${transportedChordsText}`;
  }, [transportedChordsText, selectedTonicity, baseChord, lastSign, currentCharacteristics]);

  const storedRoad = useMemo(() => extractMakamFromCharacteristics(currentCharacteristics), [currentCharacteristics]);
  const shouldAskRoadVote = Boolean(songId && !storedRoad);

  function computeHarmonyAnalysis() {
    if (!transportedChordsText.trim()) return null;
    const cached = analysisCacheRef.current.get(analysisKey);
    if (cached) return cached;
    const next = analyzeHarmony(
      transportedChordsText,
      selectedTonicity || baseChord,
      lastSign,
      extractMakamFromCharacteristics(currentCharacteristics),
    );
    if (analysisCacheRef.current.size > 8) analysisCacheRef.current.clear();
    analysisCacheRef.current.set(analysisKey, next);
    return next;
  }

  function toggleHarmonyAnalysis() {
    if (analysisOpen) {
      setAnalysisOpen(false);
      return;
    }

    setAnalysisOpen(true);
    const cached = analysisCacheRef.current.get(analysisKey);
    if (cached) {
      setHarmonyAnalysis(cached);
      return;
    }

    setAnalysisPending(true);
    setHarmonyAnalysis(null);
    window.requestAnimationFrame(() => {
      const next = computeHarmonyAnalysis();
      setHarmonyAnalysis(next);
      setAnalysisPending(false);
    });
  }

  async function loadRoadVotes() {
    if (!songId) return;
    setRoadVotesLoading(true);
    setRoadVoteError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/road-votes`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      setRoadVotes(data as RoadVoteSummary);
      if (data?.myVote?.road) {
        setRoadVoteDraft(data.myVote.road);
        setRoadVoteConfidence(data.myVote.confidence || 3);
      }
    } catch (error: any) {
      setRoadVoteError(error?.message || "Δεν ήταν δυνατή η φόρτωση των υποβολών.");
    } finally {
      setRoadVotesLoading(false);
    }
  }

  async function submitRoadVote(roadInput?: string) {
    if (!songId || roadVoteSaving) return;
    const road = cleanRoadName(roadInput ?? roadVoteDraft);
    if (!road) {
      setRoadVoteError("Επίλεξε ή γράψε δρόμο/μακάμ.");
      return;
    }

    setRoadVoteSaving(true);
    setRoadVoteError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/road-votes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ road }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      setRoadVotes(data as RoadVoteSummary);
      if (typeof data?.characteristics === "string" || data?.characteristics === null) {
        setCurrentCharacteristics(data.characteristics ?? "");
      } else if (data?.selectedRoad) {
        setCurrentCharacteristics(setMakamInCharacteristics(currentCharacteristics, data.selectedRoad) ?? "");
      }
      setRoadVoteDraft(road);
      setRoadVoteOpen(false);
    } catch (error: any) {
      const msg = String(error?.message || "");
      setRoadVoteError(msg.includes("401") || /auth|σύνδεση|unauthorized/i.test(msg) ? "Χρειάζεται σύνδεση για να υποβάλεις δρόμο/μακάμ." : msg || "Δεν αποθηκεύτηκε η υποβολή.");
    } finally {
      setRoadVoteSaving(false);
    }
  }

  function openRoadVoteDialog() {
    if (!songId || storedRoad) return;
    setRoadVoteOpen(true);
    setRoadVoteError(null);

    if (!harmonyAnalysis && transportedChordsText.trim()) {
      const next = computeHarmonyAnalysis();
      setHarmonyAnalysis(next);
    }

    if (!roadVotes && !roadVotesLoading) void loadRoadVotes();
  }

  useEffect(() => {
    if (!roadVoteOpen || !shouldAskRoadVote || roadVotes || roadVotesLoading) return;
    void loadRoadVotes();
  }, [roadVoteOpen, shouldAskRoadVote, roadVotes, roadVotesLoading]);

  function openChordsEdit() {
    const auto = detectLastChordAndSign(currentChords);
    const hasStoredBase = !!originalKeyCodeStringToBaseChord(originalKey);
    const nextBase = baseChord || auto.baseChord;
    const nextSign = lastSign || auto.sign;
    setEditChords(currentChords);
    setEditBaseChord(nextBase);
    setEditBaseSource(hasStoredBase ? "stored" : nextBase ? "detected" : "empty");
    setEditSign(nextSign);
    setEditMakam(extractMakamFromCharacteristics(currentCharacteristics));
    setEditAnalysis(null);
    setEditError(null);
    setEditOpen(true);
  }

  function runEditAiAnalysis() {
    const auto = detectLastChordAndSign(editChords);
    const analysisBase = editBaseChord || auto.baseChord;
    const analysisSign = editSign || auto.sign;
    const next = analyzeHarmony(editChords, analysisBase, analysisSign, editMakam);
    setEditAnalysis(next);
    if (!editBaseChord && auto.baseChord) {
      setEditBaseChord(auto.baseChord);
      setEditBaseSource("detected");
    }
    if (!editSign && auto.sign) setEditSign(auto.sign);
    if (!editMakam.trim()) {
      const road = cleanRoadName(next.road);
      if (road && !/δεν υπάρχει|απροσδιόριστο/i.test(road)) setEditMakam(road);
    }
  }

  async function saveChordsEdit() {
    if (!songId || editSaving) return;
    const nextBase = editBaseChord && isValidTonicity(editBaseChord) ? editBaseChord : null;
    const nextSign = editSign === "-" ? "-" : editSign === "+" ? "+" : null;
    const nextCharacteristics = setMakamInCharacteristics(currentCharacteristics, editMakam);
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/full`, {
        method: "PATCH",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chords: editChords.trim() ? editChords : null,
          originalKey: baseChordToOriginalKeyCode(nextBase),
          originalKeySign: nextSign,
          characteristics: nextCharacteristics,
        }),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
      }

      setCurrentChords(editChords);
      setBaseChord(nextBase);
      setSelectedTonicity(nextBase);
      setLastSign(nextSign);
      setCurrentCharacteristics(nextCharacteristics ?? "");
      setAnalysisOpen(false);
      setHarmonyAnalysis(null);
      analysisCacheRef.current.clear();
      dispatchTonicityChanged({ tonicity: nextBase, sign: nextSign });
      setEditOpen(false);
    } catch (err: any) {
      setEditError(String(err?.message || err || "Αποτυχία αποθήκευσης."));
    } finally {
      setEditSaving(false);
    }
  }

  useEffect(() => {
    if (!analysisOpen) return;
    const cached = analysisCacheRef.current.get(analysisKey);
    if (cached) {
      setHarmonyAnalysis(cached);
      return;
    }
    setAnalysisPending(true);
    setHarmonyAnalysis(null);
    const frame = window.requestAnimationFrame(() => {
      const next = computeHarmonyAnalysis();
      setHarmonyAnalysis(next);
      setAnalysisPending(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [analysisOpen, analysisKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(CHORDS_SCALE_STORAGE_KEY);
      if (!raw) return;

      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        setChordsScale(clampScale(n));
      }
    } catch {}
  }, []);

  function persistChordsScale(next: number) {
    try {
      window.localStorage.setItem(CHORDS_SCALE_STORAGE_KEY, String(next));
    } catch {}
  }

  function applyChordsScale(next: number) {
    const clamped = clampScale(next);
    setChordsScale(clamped);
    persistChordsScale(clamped);
  }

  useEffect(() => {
    const el = chordsBlockRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;

      e.preventDefault();

      const step = 0.08;
      const direction = e.deltaY > 0 ? -1 : 1;

      setChordsScale((prev) => {
        const next = clampScale(prev + direction * step);
        persistChordsScale(next);
        return next;
      });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as EventListener);
  }, []);

  useEffect(() => {
    const el = chordsBlockRef.current;
    if (!el) return;

    function onTouchStartNative(e: TouchEvent) {
      if (e.touches.length !== 2) return;

      const d0 = distance2(e.touches[0], e.touches[1]);
      pinchRef.current = {
        dist0: d0,
        scale0: chordsScale,
        active: true,
      };

      e.preventDefault();
    }

    function onTouchMoveNative(e: TouchEvent) {
      const p = pinchRef.current;
      if (!p?.active || e.touches.length !== 2) return;

      e.preventDefault();

      const d1 = distance2(e.touches[0], e.touches[1]);
      if (p.dist0 <= 0) return;

      const factor = d1 / p.dist0;
      const next = clampScale(p.scale0 * factor);
      setChordsScale(next);
    }

    function onTouchEndNative() {
      const p = pinchRef.current;
      if (!p?.active) return;

      pinchRef.current = null;

      setChordsScale((prev) => {
        persistChordsScale(prev);
        return prev;
      });
    }

    function onGesture(e: Event) {
      e.preventDefault();
    }

    el.addEventListener("touchstart", onTouchStartNative, { passive: false });
    el.addEventListener("touchmove", onTouchMoveNative, { passive: false });
    el.addEventListener("touchend", onTouchEndNative, { passive: true });
    el.addEventListener("touchcancel", onTouchEndNative, { passive: true });

    el.addEventListener("gesturestart", onGesture as EventListener, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gesturechange", onGesture as EventListener, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gestureend", onGesture as EventListener, { passive: false } as AddEventListenerOptions);

    return () => {
      el.removeEventListener("touchstart", onTouchStartNative as EventListener);
      el.removeEventListener("touchmove", onTouchMoveNative as EventListener);
      el.removeEventListener("touchend", onTouchEndNative as EventListener);
      el.removeEventListener("touchcancel", onTouchEndNative as EventListener);
      el.removeEventListener("gesturestart", onGesture as EventListener);
      el.removeEventListener("gesturechange", onGesture as EventListener);
      el.removeEventListener("gestureend", onGesture as EventListener);
    };
  }, [chordsScale]);

  function chordsZoomIn() {
    applyChordsScale(chordsScale + 0.12);
  }

  function chordsZoomOut() {
    applyChordsScale(chordsScale - 0.12);
  }

  function chordsZoomReset() {
    applyChordsScale(1);
  }

  return (
    <section
      id="chords"
      data-base-tonicity={baseChord || ""}
      data-base-sign={lastSign ?? ""}
      className="song-chords-container"
      style={{ marginBottom: 0 }}
    >
      {baseChord && (
        <div className="tonicities-wrapper" style={{ marginTop: 4, marginBottom: 4 }}>
          <div className="tonicities-row">
            {NATURAL_TONICITIES.map((ton) => {
              const selected = selectedTonicity === ton;
              const label = `${ton}${lastSign ?? ""}`;

              return (
                <button
                  key={ton}
                  type="button"
                  className={"tonicity-button" + (selected ? " selected" : "")}
                  data-tonicity={ton}
                  onClick={() => applySelectedTonicity(ton)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="tonicities-row">
            {SHARP_TONICITIES.map((ton) => {
              const selected = selectedTonicity === ton;
              const label = `${ton}${lastSign ?? ""}`;

              return (
                <button
                  key={ton}
                  type="button"
                  className={"tonicity-button" + (selected ? " selected" : "")}
                  data-tonicity={ton}
                  onClick={() => applySelectedTonicity(ton)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="song-road-row">
            {storedRoad ? (
              <span className="song-road-known">
                Δρόμος / Μακάμ: <strong>{storedRoad}</strong>
              </span>
            ) : songId ? (
              <button type="button" className="song-road-question" onClick={openRoadVoteDialog}>
                Ξέρεις τι δρόμος / μακάμ είναι;
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="chords-shell">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            marginTop: 2,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <div className="chords-tools">
            <button
              type="button"
              className="harmony-button"
              onClick={toggleHarmonyAnalysis}
              aria-expanded={analysisOpen}
              disabled={!transportedChordsText.trim()}
              title="Αρμονική ανάλυση συγχορδιών"
            >
              {analysisOpen ? "Κλείσιμο ανάλυσης" : "AI αρμονική ανάλυση"}
            </button>
            {canEdit && songId ? (
              <button
                type="button"
                className="chords-edit-link"
                title="Επεξεργασία συγχορδιών"
                aria-label="Επεξεργασία συγχορδιών"
                onClick={openChordsEdit}
              >
                <Pencil size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>

        {harmonyAnalysis?.tonic ? (
          <div className="harmony-summary">
            {harmonyAnalysis.road} · {harmonyAnalysis.tonic}
            {harmonyAnalysis.tonicSign ?? ""} · {harmonyAnalysis.confidence}%
          </div>
        ) : (
          <div className="harmony-summary">Άμεση ανάλυση στη συσκευή, χωρίς αναμονή server</div>
        )}
      </div>

      {analysisOpen && (
        <div className="harmony-panel">
          {analysisPending || !harmonyAnalysis ? (
            <div className="harmony-loading">Αναλύω τις συγχορδίες...</div>
          ) : (
            <>
              <div className="harmony-panel-head">
                <div>
                  <div className="harmony-label">Πιθανότερο συμπέρασμα</div>
                  <strong>
                    {harmonyAnalysis.road}
                    {harmonyAnalysis.tonic ? ` σε ${harmonyAnalysis.tonic}${harmonyAnalysis.tonicSign ?? ""}` : ""}
                  </strong>
                </div>
                <div className="confidence-stack">
                  <span className="confidence-pill">{harmonyAnalysis.confidence}%</span>
                  <small>{harmonyAnalysis.elapsedMs}ms</small>
                </div>
              </div>

              {harmonyAnalysis.warning && <div className="harmony-warning">{harmonyAnalysis.warning}</div>}

              <div className="harmony-grid">
                <div>
                  <div className="harmony-label">Βαθμίδες</div>
                  <div>{harmonyAnalysis.uniqueDegrees.length ? harmonyAnalysis.uniqueDegrees.join(" · ") : "Δεν εντοπίστηκαν."}</div>
                </div>
                <div>
                  <div className="harmony-label">Συμπυκνωμένη πορεία</div>
                  <div>{harmonyAnalysis.progression || "Δεν υπάρχει αρκετή ακολουθία."}</div>
                </div>
              </div>

              <div className="harmony-columns">
                <div>
                  <div className="harmony-label">Γιατί το λέει</div>
                  <ul>
                    {harmonyAnalysis.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="harmony-label">Τι να ξέρει ο παίκτης</div>
                  <ul>
                    {harmonyAnalysis.playerTips.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {harmonyAnalysis.alternatives.length > 0 && (
                <div className="harmony-alternatives">
                  <div className="harmony-label">Εναλλακτικές</div>
                  {harmonyAnalysis.alternatives.map((alt) => (
                    <span key={alt.road}>
                      {alt.road} {alt.confidence}%
                    </span>
                  ))}
                </div>
              )}

            </>
          )}
            </div>
      )}

        <div
          id="chords-block"
          ref={chordsBlockRef}
          className="chords-block"
          style={{
            whiteSpace: "pre-wrap",
            backgroundColor: "transparent",
            padding: "2px 0 0",
            borderRadius: 0,
            border: "none",
            lineHeight: 1.12,
            fontFamily: "monospace",
            fontSize: Math.round(CHORDS_BASE_FONT_SIZE * chordsScale),
            touchAction: "pan-y",
            WebkitTextSizeAdjust: "100%",
          }}
          dangerouslySetInnerHTML={{ __html: renderedChordsHtml }}
        />
      </div>

      {roadVoteOpen && shouldAskRoadVote ? (
        <div
          className="road-vote-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !roadVoteSaving) {
              setRoadVoteOpen(false);
            }
          }}
        >
          <div className="road-vote-modal" role="dialog" aria-modal="true" aria-label="Υποβολή δρόμου ή μακάμ">
            <div className="road-vote-modal-head">
              <div>
                <span>Ερώτηση κοινότητας</span>
                <strong>Ξέρεις τι δρόμος / μακάμ είναι;</strong>
              </div>
              <button type="button" onClick={() => setRoadVoteOpen(false)} disabled={roadVoteSaving} aria-label="Κλείσιμο">
                ×
              </button>
            </div>

            <div className="road-vote-box">
              {roadVotesLoading ? <div className="road-vote-muted">Φόρτωση υποβολών...</div> : null}

              {roadVotes?.totals?.length ? (
                <div className="road-vote-results">
                  {roadVotes.totals.slice(0, 6).map((item) => (
                    <button
                      key={item.road}
                      type="button"
                      className="road-vote-result"
                      onClick={() => {
                        setRoadVoteDraft(item.road);
                        void submitRoadVote(item.road);
                      }}
                      disabled={roadVoteSaving}
                      title={`${item.votes} υποβολές`}
                    >
                      <span>{item.road}</span>
                      <small>{item.votes} υποβολές</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="road-vote-muted">Δεν υπάρχουν ακόμα υποβολές για αυτό το τραγούδι.</div>
              )}

              {harmonyAnalysis?.possibleRoads?.length ? (
                <div className="road-vote-suggestions">
                  <div className="harmony-label">Προτάσεις από την ανάλυση</div>
                  {harmonyAnalysis.possibleRoads.slice(0, 5).map((item) => (
                    <button
                      key={`suggest-${item.road}`}
                      type="button"
                      className="road-vote-chip"
                      onClick={() => {
                        setRoadVoteDraft(cleanRoadName(item.road));
                        void submitRoadVote(item.road);
                      }}
                      disabled={roadVoteSaving}
                      title={item.reason}
                    >
                      {item.road}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="road-vote-form">
                <input
                  list="repertorio-road-vote-options"
                  value={roadVoteDraft}
                  onChange={(event) => setRoadVoteDraft(event.currentTarget.value)}
                  placeholder="Άλλος δρόμος / μακάμ"
                  disabled={roadVoteSaving}
                />
                <datalist id="repertorio-road-vote-options">
                  {MAKAM_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className="road-vote-save"
                  onClick={() => submitRoadVote()}
                  disabled={roadVoteSaving || !roadVoteDraft.trim()}
                >
                  {roadVoteSaving ? "Αποθήκευση..." : roadVoteDraft && roadVotes?.myVote ? "Αλλαγή υποβολής" : "Υποβολή"}
                </button>
              </div>

              {roadVotes?.myVote ? (
                <div className="road-vote-muted">
                  Η υποβολή σου: <strong>{roadVotes.myVote.road}</strong>
                </div>
              ) : null}

              {roadVoteError ? <div className="road-vote-error">{roadVoteError}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && (
        <div
          className="chords-edit-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editSaving) {
              setEditOpen(false);
            }
          }}
        >
          <div className="chords-edit-modal" role="dialog" aria-modal="true" aria-label="Επεξεργασία συγχορδιών">
            <div className="chords-edit-head">
              <strong>Επεξεργασία συγχορδιών</strong>
              <div className="chords-edit-head-actions">
                <button type="button" className="edit-ai-button" onClick={runEditAiAnalysis} disabled={editSaving || !editChords.trim()}>
                  AI ανάλυση
                </button>
                <button type="button" className="chords-edit-close" onClick={() => setEditOpen(false)} disabled={editSaving}>
                  ×
                </button>
              </div>
            </div>

            <div className="edit-current-key">
              <span>Τονικότητα τραγουδιού</span>
              <strong>{editBaseChord ? `${editBaseChord}${editSign ?? ""}` : "Δεν έχει οριστεί"}</strong>
              <em>
                {editBaseSource === "stored"
                  ? "από τη βάση"
                  : editBaseSource === "detected"
                    ? "ανίχνευση από τελευταία συγχορδία"
                    : editBaseSource === "manual"
                      ? "χειροκίνητη επιλογή"
                      : "χωρίς επιλογή"}
              </em>
            </div>

            <div className="chords-edit-field">
              <span>Κλίμακα / βάση</span>
              <div className="edit-tonicity-grid">
                {[...NATURAL_TONICITIES, ...SHARP_TONICITIES].map((tonicity) => (
                  <button
                    key={tonicity}
                    type="button"
                    className={"edit-tonicity-choice" + (editBaseChord === tonicity ? " selected" : "")}
                    onClick={() => {
                      setEditBaseChord(tonicity);
                      setEditBaseSource("manual");
                    }}
                    disabled={editSaving}
                  >
                    {tonicity}
                  </button>
                ))}
              </div>
              <div className="edit-sign-row" aria-label="Πρόσημο">
                <button
                  type="button"
                  className={"edit-sign-choice" + (editSign === "-" ? " selected" : "")}
                  onClick={() => {
                    setEditSign("-");
                    if (editBaseChord) setEditBaseSource("manual");
                  }}
                  disabled={editSaving}
                >
                  -
                </button>
                <button
                  type="button"
                  className={"edit-sign-choice" + (editSign === "+" ? " selected" : "")}
                  onClick={() => {
                    setEditSign("+");
                    if (editBaseChord) setEditBaseSource("manual");
                  }}
                  disabled={editSaving}
                >
                  +
                </button>
                <button
                  type="button"
                  className="edit-clear-choice"
                  onClick={() => {
                    setEditBaseChord(null);
                    setEditSign(null);
                    setEditBaseSource("empty");
                  }}
                  disabled={editSaving}
                >
                  Χωρίς επιλογή
                </button>
              </div>
            </div>

            <label className="chords-edit-field">
              <span>Μακάμ / δρόμος</span>
              <input
                className="edit-makam-input"
                list="repertorio-makam-options"
                value={editMakam}
                onChange={(event) => setEditMakam(event.currentTarget.value)}
                placeholder="Αναζήτηση ή νέος δρόμος"
                disabled={editSaving}
              />
              <datalist id="repertorio-makam-options">
                {MAKAM_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {editAnalysis ? (
                <div className="edit-ai-result">
                  <div>
                    Πρόταση AI: <strong>{editAnalysis.road}</strong>
                    {editAnalysis.tonic ? ` σε ${editAnalysis.tonic}${editAnalysis.tonicSign ?? ""}` : ""} · {editAnalysis.confidence}%
                  </div>
                  <div className="edit-ai-note">
                    Η επιλεγμένη τονικότητα, το πρόσημο και ο αποθηκευμένος δρόμος θεωρούνται σωστή βάση.
                  </div>
                  {editAnalysis.possibleRoads.length ? (
                    <div className="edit-road-suggestions">
                      <strong>Θα μπορούσε να είναι</strong>
                      <div className="edit-road-chip-row">
                        {editAnalysis.possibleRoads.map((item) => (
                          <button
                            key={`${item.road}-${item.confidence}`}
                            type="button"
                            className="edit-road-chip possible"
                            onClick={() => setEditMakam(cleanRoadName(item.road))}
                            disabled={editSaving}
                            title={item.reason}
                          >
                            <span>{item.road}</span>
                            <small>{item.confidence}%</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {editAnalysis.unlikelyRoads.length ? (
                    <div className="edit-road-suggestions">
                      <strong>Δεν ταιριάζει</strong>
                      <div className="edit-road-chip-row">
                        {editAnalysis.unlikelyRoads.map((item) => (
                          <span key={item.road} className="edit-road-chip unlikely" title={item.reason}>
                            <span>{item.road}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </label>

            <label className="chords-edit-field">
              <span>Συγχορδίες</span>
              <textarea
                value={editChords}
                onChange={(event) => setEditChords(event.currentTarget.value)}
                rows={12}
                disabled={editSaving}
              />
            </label>

            {editError ? <div className="chords-edit-error">{editError}</div> : null}

            <div className="chords-edit-actions">
              <button type="button" className="chords-edit-cancel" onClick={() => setEditOpen(false)} disabled={editSaving}>
                Άκυρο
              </button>
              <button type="button" className="chords-edit-save" onClick={saveChordsEdit} disabled={editSaving}>
                {editSaving ? "Αποθήκευση..." : "Αποθήκευση"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .tonicities-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 2px;
        }

        .tonicity-button {
          background: #222;
          color: #fff;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 3px 7px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: 0.2s;
        }

        .tonicity-button:hover {
          background: #444;
        }

        .tonicity-button.selected {
          background: #ff4747 !important;
          border-color: #ff4747 !important;
          color: #fff !important;
          font-weight: bold;
        }

        .song-road-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 5px;
        }

        .song-road-known,
        .song-road-question {
          border: 1px solid #3a3a3a;
          border-radius: 999px;
          background: #171717;
          color: #f4f4f4;
          font-size: 0.88rem;
          font-weight: 800;
          line-height: 1.2;
          padding: 6px 9px;
        }

        .song-road-known strong {
          color: #22c55e;
        }

        .song-road-question {
          cursor: pointer;
        }

        .song-road-question:hover {
          border-color: #8b5cf6;
        }

	        .SpTune {
	          color: #ffd700;
	          font-weight: bold;
	        }

	        .chords-shell {
	          background: #0b0b0b;
	          border: 1px solid #333;
	          border-radius: 10px;
	          padding: 7px 10px 9px;
	        }

	        .chords-tools {
	          display: inline-flex;
	          align-items: center;
	          gap: 6px;
	          min-width: 0;
	        }

	        .harmony-button {
	          border: 1px solid #444;
	          background: #191919;
          color: #fff;
          border-radius: 8px;
          padding: 6px 10px;
          cursor: pointer;
	          font-size: 0.86rem;
	          font-weight: 800;
	        }

	        .chords-edit-link {
	          width: 32px;
	          height: 32px;
	          min-width: 32px;
	          display: inline-flex;
	          align-items: center;
	          justify-content: center;
	          border: 1px solid #444;
	          border-radius: 8px;
	          background: #191919;
	          color: #fff;
	          cursor: pointer;
	          padding: 0;
	          text-decoration: none;
	        }

	        .chords-edit-link:hover {
	          background: #262626;
	          border-color: #666;
	        }

        .harmony-button:hover:not(:disabled) {
          background: #262626;
          border-color: #666;
        }

        .harmony-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .harmony-summary {
          min-width: 0;
          color: #cfcfcf;
          font-size: 0.82rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .harmony-panel {
          display: grid;
          gap: 10px;
          margin: 0 0 8px;
          padding: 12px;
          border: 1px solid #333;
          border-radius: 10px;
          background: #111;
          color: #f5f5f5;
          font-size: 0.92rem;
          line-height: 1.35;
        }

        .harmony-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .harmony-label {
          color: #aaa;
          font-size: 0.78rem;
          font-weight: 800;
          margin-bottom: 3px;
        }

        .confidence-pill {
          flex: 0 0 auto;
          border: 1px solid #555;
          border-radius: 999px;
          padding: 4px 8px;
          background: #222;
          font-weight: 800;
        }

        .confidence-stack {
          display: grid;
          justify-items: end;
          gap: 2px;
        }

        .confidence-stack small {
          color: #8f8f8f;
          font-size: 0.72rem;
        }

        .harmony-loading {
          color: #d8d8d8;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 9px 10px;
          background: #151515;
        }

        .harmony-warning {
          color: #ffd28a;
          border: 1px solid #4b3a1f;
          border-radius: 8px;
          padding: 7px 9px;
          background: #1d160b;
        }

        .harmony-grid,
        .harmony-columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .harmony-panel ul {
          margin: 0;
          padding-left: 18px;
        }

        .harmony-panel li {
          margin: 3px 0;
        }

        .harmony-alternatives {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }

        .harmony-alternatives span {
          border: 1px solid #333;
          border-radius: 999px;
          padding: 4px 8px;
          background: #1a1a1a;
        }

        .road-vote-box {
          display: grid;
          gap: 10px;
          margin-top: 12px;
          border: 1px solid #373737;
          border-radius: 12px;
          background: #101010;
          padding: 10px;
        }

        .road-vote-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10060;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.68);
        }

        .road-vote-modal {
          width: min(620px, calc(100vw - 24px));
          max-height: min(84vh, 680px);
          overflow: auto;
          overflow-x: hidden;
          border: 1px solid #3a3a3a;
          border-radius: 14px;
          background: #121212;
          color: #fff;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
          padding: 14px;
        }

        .road-vote-modal,
        .road-vote-modal * {
          box-sizing: border-box;
          min-width: 0;
        }

        .road-vote-modal-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .road-vote-modal-head div {
          display: grid;
          gap: 3px;
        }

        .road-vote-modal-head span {
          color: #aaa;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .road-vote-modal-head strong {
          font-size: 1.06rem;
        }

        .road-vote-modal-head button {
          width: 34px;
          height: 34px;
          border: 1px solid #444;
          border-radius: 8px;
          background: #1d1d1d;
          color: #fff;
          cursor: pointer;
          font-size: 1.35rem;
          line-height: 1;
        }

        .road-vote-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .road-vote-results,
        .road-vote-suggestions,
        .road-vote-form,
        .road-vote-rating {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }

        .road-vote-result,
        .road-vote-chip,
        .road-vote-rating button,
        .road-vote-save {
          border: 1px solid #444;
          border-radius: 999px;
          background: #202020;
          color: #fff;
          cursor: pointer;
          font-weight: 800;
        }

        .road-vote-result {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          max-width: 100%;
          padding: 6px 9px;
        }

        .road-vote-result small {
          color: #bdbdbd;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .road-vote-chip {
          padding: 6px 9px;
        }

        .road-vote-chip:hover,
        .road-vote-result:hover {
          border-color: #8b5cf6;
        }

        .road-vote-form input {
          flex: 1 1 180px;
          min-width: 0;
          border: 1px solid #3d3d3d;
          border-radius: 10px;
          background: #070707;
          color: #f7f7f7;
          padding: 8px 9px;
        }

        .road-vote-rating button {
          width: 30px;
          height: 30px;
          padding: 0;
        }

        .road-vote-rating button.selected {
          background: #8b5cf6;
          border-color: #8b5cf6;
        }

        .road-vote-save {
          background: #8b5cf6;
          border-color: #8b5cf6;
          padding: 7px 12px;
        }

        .road-vote-muted {
          color: #bdbdbd;
          font-size: 0.86rem;
        }

        .road-vote-error {
          border: 1px solid #6d2a2a;
          border-radius: 8px;
          background: #2a1010;
          color: #ffd4d4;
          padding: 7px 9px;
          font-size: 0.86rem;
        }

        .road-vote-result:disabled,
        .road-vote-chip:disabled,
        .road-vote-rating button:disabled,
        .road-vote-save:disabled,
        .road-vote-form input:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        .chords-edit-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10050;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.68);
        }

        .chords-edit-modal {
          width: min(720px, calc(100vw - 24px));
          max-height: min(88vh, 780px);
          overflow: auto;
          overflow-x: hidden;
          border: 1px solid #3a3a3a;
          border-radius: 14px;
          background: #121212;
          color: #fff;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
          padding: 14px;
        }

        .chords-edit-modal,
        .chords-edit-modal * {
          box-sizing: border-box;
          min-width: 0;
        }

        .chords-edit-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .chords-edit-head strong {
          font-size: 1.06rem;
        }

        .chords-edit-head-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex: 0 0 auto;
        }

        .chords-edit-close {
          width: 34px;
          height: 34px;
          border: 1px solid #444;
          border-radius: 8px;
          background: #1d1d1d;
          color: #fff;
          cursor: pointer;
          font-size: 1.35rem;
          line-height: 1;
        }

        .edit-ai-button {
          border: 1px solid #5b3fd1;
          border-radius: 9px;
          background: #4b2fc8;
          color: #fff;
          cursor: pointer;
          font-weight: 850;
          padding: 8px 10px;
          white-space: nowrap;
        }

        .edit-current-key {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin: 0 0 12px;
          border: 1px solid #333;
          border-radius: 10px;
          background: #0b0b0b;
          padding: 9px 10px;
        }

        .edit-current-key span {
          color: #bdbdbd;
          font-weight: 750;
        }

        .edit-current-key strong {
          color: #fff;
          font-size: 1rem;
        }

        .edit-current-key em {
          color: #a5a5a5;
          font-size: 0.82rem;
          font-style: normal;
        }

        .chords-edit-field {
          display: grid;
          gap: 8px;
          margin-bottom: 12px;
        }

        .chords-edit-field > span {
          color: #d4d4d4;
          font-weight: 800;
        }

        .edit-tonicity-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .edit-tonicity-choice,
        .edit-sign-choice,
        .edit-clear-choice {
          border: 1px solid #444;
          border-radius: 8px;
          background: #202020;
          color: #fff;
          cursor: pointer;
          font-weight: 800;
          padding: 6px 10px;
        }

        .edit-tonicity-choice.selected,
        .edit-sign-choice.selected {
          background: #ff4747;
          border-color: #ff4747;
        }

        .edit-sign-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .edit-sign-choice {
          min-width: 38px;
        }

        .edit-clear-choice {
          color: #d6d6d6;
          font-weight: 700;
        }

        .edit-makam-input {
          width: 100%;
          border: 1px solid #3d3d3d;
          border-radius: 10px;
          background: #070707;
          color: #f7f7f7;
          font-size: 1rem;
          padding: 9px 10px;
        }

        .edit-ai-result {
          display: grid;
          gap: 8px;
          border: 1px solid #333;
          border-radius: 9px;
          background: #171717;
          color: #dcdcdc;
          padding: 8px 10px;
          font-size: 0.9rem;
          line-height: 1.3;
        }

        .edit-ai-note {
          color: #a8a8a8;
          font-size: 0.82rem;
        }

        .edit-road-suggestions {
          display: grid;
          gap: 6px;
        }

        .edit-road-suggestions > strong {
          color: #eeeeee;
          font-size: 0.86rem;
        }

        .edit-road-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .edit-road-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          border: 1px solid #3e3e3e;
          border-radius: 999px;
          background: #222;
          color: #f4f4f4;
          font-weight: 800;
          line-height: 1.15;
          padding: 5px 8px;
        }

        .edit-road-chip.possible {
          cursor: pointer;
        }

        .edit-road-chip.possible:hover {
          border-color: #22c55e;
          color: #ffffff;
        }

        .edit-road-chip.unlikely {
          color: #bdbdbd;
          background: #151515;
        }

        .edit-road-chip small {
          color: #22c55e;
          font-size: 0.76rem;
          font-weight: 900;
        }

        .chords-edit-field textarea {
          width: 100%;
          min-height: 260px;
          resize: vertical;
          border: 1px solid #3d3d3d;
          border-radius: 10px;
          background: #070707;
          color: #f7f7f7;
          font-family: monospace;
          font-size: 0.98rem;
          line-height: 1.35;
          padding: 10px;
        }

        .chords-edit-error {
          margin-bottom: 12px;
          border: 1px solid #6d2a2a;
          border-radius: 8px;
          background: #2a1010;
          color: #ffd4d4;
          padding: 8px 10px;
          font-size: 0.9rem;
        }

        .chords-edit-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .chords-edit-cancel,
        .chords-edit-save {
          border: 1px solid #444;
          border-radius: 9px;
          cursor: pointer;
          font-weight: 800;
          padding: 8px 12px;
        }

        .chords-edit-cancel {
          background: #1d1d1d;
          color: #fff;
        }

        .chords-edit-save {
          background: #0b72ff;
          border-color: #0b72ff;
          color: #fff;
        }

        .chords-edit-close:disabled,
        .edit-ai-button:disabled,
        .edit-tonicity-choice:disabled,
        .edit-sign-choice:disabled,
        .edit-clear-choice:disabled,
        .chords-edit-cancel:disabled,
        .chords-edit-save:disabled,
        .chords-edit-field textarea:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        @media (max-width: 640px) {
          .harmony-summary {
            flex-basis: 100%;
            white-space: normal;
          }

          .harmony-panel-head,
          .harmony-grid,
          .harmony-columns {
            grid-template-columns: 1fr;
          }

          .harmony-panel-head {
            display: grid;
          }

          .chords-shell {
            padding: 7px;
          }

          .harmony-button {
            padding: 6px 8px;
            font-size: 0.8rem;
          }

          .chords-edit-modal {
            padding: 12px;
          }

          .chords-edit-head {
            align-items: flex-start;
          }

          .chords-edit-head-actions {
            gap: 6px;
          }

          .edit-ai-button {
            padding: 8px;
            font-size: 0.82rem;
          }

          .chords-edit-field textarea {
            min-height: 220px;
          }
        }
      `}</style>
    </section>
  );
}
