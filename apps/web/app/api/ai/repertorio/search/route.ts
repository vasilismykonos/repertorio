import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

type SearchCandidate = {
  id: number;
  title: string;
  firstLyrics: string;
  lyrics: string;
  characteristics?: string | null;
  category?: string | null;
  categoryTitle?: string | null;
  rythm?: string | null;
  rythmTitle?: string | null;
  tagTitles?: string[] | null;
  composerName?: string | null;
  lyricistName?: string | null;
  singerFrontNames?: string[] | null;
  singerBackNames?: string[] | null;
  yearText?: string | null;
  years?: number[] | null;
  views?: number | null;
  status?: string | null;
  chords?: unknown;
  partiture?: unknown;
  hasChords?: boolean | null;
  hasScore?: boolean | null;
  hasLyrics?: boolean | null;
  isInstrumental?: boolean | null;
};

type WeightedSignal = {
  label: string;
  terms: string[];
  points: number;
};

type MusicProfile = {
  id: string;
  label: string;
  triggers: string[];
  searchTerms: string[];
  signals: WeightedSignal[];
  negativeSignals?: WeightedSignal[];
};

type SearchIntent = {
  original: string;
  normalized: string;
  profiles: MusicProfile[];
  labels: string[];
  searchTerms: string[];
  artistHints: Array<{ label: string; aliases: string[] }>;
  flags: {
    wantsChords: boolean | null;
    wantsScore: boolean | null;
    wantsLyrics: "lyrics" | "noLyrics" | "instrumental" | null;
    popular: boolean;
    pending: boolean;
    yearFrom: number | null;
    yearTo: number | null;
    programUse: boolean;
  };
  freeTokens: string[];
};

type RankedCandidate = SearchCandidate & {
  aiScore: number;
  reasons: string[];
};

const MUSIC_PROFILES: MusicProfile[] = [
  {
    id: "magika",
    label: "μάγκικο ύφος",
    triggers: ["μαγκικ", "μαγκικα", "μαγκικο", "μαγκες", "μαγκασ", "νταηδικ", "μορτικ"],
    searchTerms: [
      "μάγκας",
      "μάγκες",
      "μόρτης",
      "νταής",
      "κουτσαβάκης",
      "τεκές",
      "αργιλές",
      "ναργιλές",
      "χασικλής",
      "φυλακή",
      "πιάτσα",
      "μπαγλαμάς",
      "ρεμπέτικο",
    ],
    signals: [
      {
        label: "μάγκικο λεξιλόγιο/θεματολογία",
        terms: ["μαγκ", "μορτ", "νταη", "κουτσαβακ", "πιατσα", "φυλακ"],
        points: 9,
      },
      {
        label: "τεκές/αργιλές/χασικλίδικο περιβάλλον",
        terms: ["τεκε", "αργιλε", "ναργιλε", "χασικ", "λουλα", "φουμαρ", "κοκαιν"],
        points: 9,
      },
      { label: "ρεμπέτικο περιβάλλον", terms: ["ρεμπετ", "μπαγλαμ", "μπουζουκ"], points: 5 },
    ],
  },
  {
    id: "rebetika",
    label: "ρεμπέτικα",
    triggers: ["ρεμπετικ", "ρεμπετικα", "ρεμπετη", "ρεμπετισ"],
    searchTerms: ["ρεμπέτικο", "μπουζούκι", "μπαγλαμάς", "τεκές", "Πειραιάς", "Σμύρνη"],
    signals: [
      { label: "ρεμπέτικη αναφορά", terms: ["ρεμπετ", "μπουζουκ", "μπαγλαμ", "τεκε"], points: 8 },
      { label: "παλιό λαϊκό/πειραιώτικο χρώμα", terms: ["πειραι", "σμυρν", "προσφυγ"], points: 4 },
    ],
  },
  {
    id: "hasiklidika",
    label: "χασικλίδικα",
    triggers: ["χασικ", "τεκε", "τεκεδε", "αργιλε", "ναργιλε", "λουλα", "φουμαρ"],
    searchTerms: ["χασικλής", "τεκές", "αργιλές", "ναργιλές", "λουλάς", "φουμάρω"],
    signals: [
      {
        label: "χασικλίδικη θεματολογία",
        terms: ["χασικ", "τεκε", "αργιλε", "ναργιλε", "λουλα", "φουμαρ"],
        points: 12,
      },
    ],
  },
  {
    id: "prison",
    label: "φυλακής/παρανομίας",
    triggers: ["φυλακ", "δικασ", "καταδικ", "παρανομ", "μπουζου"],
    searchTerms: ["φυλακή", "δικασμένος", "κατάδικος", "παράνομος"],
    signals: [
      { label: "φυλακή/δικαστήριο", terms: ["φυλακ", "δικασ", "καταδικ", "κελι"], points: 10 },
      { label: "περιθώριο/παρανομία", terms: ["παρανομ", "μπουζου", "νταη"], points: 5 },
    ],
  },
  {
    id: "smyrneika",
    label: "σμυρναίικο ύφος",
    triggers: ["σμυρν", "σμυρναι", "σμυρνεικ", "αμανε", "ουτι", "σαντουρ"],
    searchTerms: ["Σμύρνη", "σμυρναίικο", "σαντούρι", "ούτι", "αμανές", "καφέ αμάν"],
    signals: [
      { label: "σμυρναίικο/ανατολίτικο χρώμα", terms: ["σμυρν", "σαντουρ", "ουτι", "αμανε", "αμαν"], points: 10 },
    ],
  },
  {
    id: "love",
    label: "ερωτικά",
    triggers: ["ερωτικ", "αγαπ", "αγαπη", "αγαπω", "καρδια", "ματια"],
    searchTerms: ["αγάπη", "αγαπώ", "καρδιά", "μάτια", "φιλί", "έρωτας"],
    signals: [
      { label: "ερωτική θεματολογία", terms: ["αγαπ", "ερωτ", "καρδια", "ματια", "φιλι"], points: 7 },
    ],
  },
  {
    id: "separation",
    label: "χωρισμού/καημού",
    triggers: ["χωρισ", "καημ", "πονο", "δακρυ", "ξενιτια", "μοναξ"],
    searchTerms: ["χωρισμός", "καημός", "πόνος", "δάκρυ", "ξενιτιά", "μόνος"],
    signals: [
      { label: "χωρισμός/καημός", terms: ["χωρισ", "καημ", "πονο", "δακρυ", "μοναξ", "ξενιτ"], points: 8 },
    ],
  },
  {
    id: "party",
    label: "γλέντι/κέφι",
    triggers: ["γλεντ", "κεφι", "χορο", "χορευτικ", "πανηγυρ", "διασκεδ"],
    searchTerms: ["γλέντι", "κέφι", "χορός", "πανηγύρι", "διασκέδαση"],
    signals: [
      { label: "γλεντζέδικο/χορευτικό κλίμα", terms: ["γλεντ", "κεφι", "χορο", "πανηγυρ", "διασκεδ"], points: 8 },
    ],
  },
  {
    id: "instrumental",
    label: "οργανικά",
    triggers: ["οργανικ", "χωρισ στιχ", "instrumental", "ταξιμ"],
    searchTerms: ["οργανικό", "ταξίμι", "ορχηστρικό"],
    signals: [
      { label: "οργανικό/ταξίμι", terms: ["οργανικ", "ταξιμ", "ορχηστρ"], points: 9 },
    ],
  },
  {
    id: "female",
    label: "γυναικεία φωνή",
    triggers: ["γυναικεια", "γυναικ", "τραγουδιστρια", "φωνη γυναικ"],
    searchTerms: ["γυναίκα", "τραγουδίστρια", "κυρία"],
    signals: [
      { label: "γυναικεία αναφορά", terms: ["γυναικ", "κοπελ", "κυρα", "μανα", "μανα μου"], points: 3 },
    ],
  },
  {
    id: "zeibekika",
    label: "ζεϊμπέκικα",
    triggers: ["ζειμπεκ", "ζεϊμπεκ", "ζειμπεκι", "ζεϊμπεκι"],
    searchTerms: ["ζεϊμπέκικο", "ζεϊμπεκικο", "βαρύ ζεϊμπέκικο"],
    signals: [
      { label: "ζεϊμπέκικος ρυθμός/αναφορά", terms: ["ζειμπεκ", "ζεϊμπεκ"], points: 10 },
    ],
  },
  {
    id: "hasapika",
    label: "χασάπικα/χασαποσέρβικα",
    triggers: ["χασαπ", "χασαποσερβ", "σερβικο"],
    searchTerms: ["χασάπικο", "χασαποσέρβικο", "σερβικό"],
    signals: [
      { label: "χασάπικος/σερβικός ρυθμός", terms: ["χασαπ", "σερβικ"], points: 10 },
    ],
  },
  {
    id: "old_laika",
    label: "παλιά λαϊκά",
    triggers: ["παλια λαικα", "παλιο λαικο", "κλασικα λαικα", "λαικα παλια"],
    searchTerms: ["λαϊκό", "παλιό λαϊκό", "Τσιτσάνης", "Χιώτης", "Παπαϊωάννου", "Μητσάκης"],
    signals: [
      { label: "παλιό λαϊκό ύφος/δημιουργοί", terms: ["λαικ", "τσιτσαν", "χιωτ", "παπαιωαν", "μητσακ"], points: 7 },
    ],
  },
];

const STOP_WORDS = new Set([
  "βρεσ",
  "ψαξε",
  "δειξε",
  "αναζητησε",
  "τραγουδια",
  "τραγουδι",
  "κομματια",
  "μου",
  "με",
  "χωρισ",
  "που",
  "εχουν",
  "εχει",
  "για",
  "σε",
  "στο",
  "στη",
  "στην",
  "στον",
  "του",
  "τησ",
  "τον",
  "την",
  "και",
  "τα",
  "το",
  "οι",
  "παλια",
  "παλιο",
  "κλασικα",
]);

const ARTIST_HINTS: Array<{ label: string; aliases: string[] }> = [
  { label: "Μάρκος Βαμβακάρης", aliases: ["μαρκοσ", "μαρκου", "βαμβακαρ", "βαμβακαρη"] },
  { label: "Βασίλης Τσιτσάνης", aliases: ["τσιτσαν", "τσιτσανη"] },
  { label: "Μανώλης Χιώτης", aliases: ["χιωτ", "χιωτη"] },
  { label: "Γιώργος Μητσάκης", aliases: ["μητσακ", "μητσακη"] },
  { label: "Γιάννης Παπαϊωάννου", aliases: ["παπαιωαν", "παπαϊωαν"] },
  { label: "Απόστολος Καλδάρας", aliases: ["καλδαρ", "καλδαρα"] },
  { label: "Στράτος Παγιουμτζής", aliases: ["στρατοσ", "παγιουμτζ", "παγιουμτζη"] },
  { label: "Ρόζα Εσκενάζυ", aliases: ["ροζα", "εσκεναζ"] },
  { label: "Ρίτα Αμπατζή", aliases: ["ριτα", "αμπατζ"] },
  { label: "Σωτηρία Μπέλλου", aliases: ["σωτηρια", "μπελλου"] },
  { label: "Μαρίκα Νίνου", aliases: ["μαρικα", "νινου"] },
  { label: "Στέλιος Καζαντζίδης", aliases: ["καζαντζιδ", "καζαντζιδη"] },
];

function getApiBaseUrl(): string {
  return (process.env.API_INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000/api/v1")
    .replace(/\/+$/, "");
}

function normalizeGreek(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ς/g, "σ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeGreek(term)));
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = normalizeGreek(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function meaningfulTokens(normalized: string) {
  return normalized
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => !STOP_WORDS.has(word))
    .slice(0, 12);
}

function buildIntent(message: string): SearchIntent {
  const normalized = normalizeGreek(message);
  const profiles = MUSIC_PROFILES.filter((profile) => hasAny(normalized, profile.triggers));
  const labels = profiles.map((profile) => profile.label);
  const artistHints = ARTIST_HINTS.filter((artist) => hasAny(normalized, artist.aliases));
  labels.push(...artistHints.map((artist) => artist.label));
  const flags = {
    wantsChords: hasAny(normalized, ["συγχορδ"]) ? !hasAny(normalized, ["χωρισ συγχορδ"]) : null,
    wantsScore: hasAny(normalized, ["παρτιτουρ", "score"]) ? !hasAny(normalized, ["χωρισ παρτιτουρ", "χωρισ score"]) : null,
    wantsLyrics: hasAny(normalized, ["οργανικ"])
      ? ("instrumental" as const)
      : hasAny(normalized, ["χωρισ στιχ"])
        ? ("noLyrics" as const)
        : hasAny(normalized, ["με στιχ", "εχει στιχ", "εχουν στιχ"])
          ? ("lyrics" as const)
          : null,
    popular: hasAny(normalized, ["δημοφιλ", "γνωστα", "γνωστοτερα"]),
    pending: hasAny(normalized, ["αναμον", "pending"]),
    yearFrom: null as number | null,
    yearTo: null as number | null,
    programUse: hasAny(normalized, ["προγραμμα", "σετ", "μαγαζ", "προβα", "live", "λαιβ"]),
  };

  if (hasAny(normalized, ["προπολεμ", "πριν τον πολεμο", "πριν το 40", "πριν το 1940"])) {
    labels.push("προπολεμικά");
    flags.yearTo = 1940;
  } else if (hasAny(normalized, ["μεσοπολεμ", "μεσοπολεμου"])) {
    labels.push("μεσοπολεμικά");
    flags.yearFrom = 1920;
    flags.yearTo = 1940;
  } else if (hasAny(normalized, ["παλια", "παλιο", "κλασικα"])) {
    labels.push("παλιά τραγούδια");
    flags.yearTo = 1960;
  }

  const decadeMatch = normalized.match(/\b(19[2-9]0|20[0-2]0)s?\b/);
  if (decadeMatch) {
    const decade = Number(decadeMatch[1]);
    if (Number.isFinite(decade)) {
      labels.push(`δεκαετία ${decade}`);
      flags.yearFrom = decade;
      flags.yearTo = decade + 9;
    }
  }

  const beforeYear = normalized.match(/\b(πριν|εωσ|ως|μεχρι)\s+(?:το\s+)?(19\d{2}|20\d{2})\b/);
  if (beforeYear) {
    flags.yearTo = Number(beforeYear[2]);
    labels.push(`έως ${beforeYear[2]}`);
  }

  const afterYear = normalized.match(/\b(μετα|απο)\s+(?:το\s+)?(19\d{2}|20\d{2})\b/);
  if (afterYear) {
    flags.yearFrom = Number(afterYear[2]);
    labels.push(`από ${afterYear[2]}`);
  }

  const freeTokens = meaningfulTokens(normalized);
  const profileTerms = profiles.flatMap((profile) => profile.searchTerms);
  const searchTerms = uniqueStrings([
    message.trim(),
    ...artistHints.flatMap((artist) => [artist.label, ...artist.aliases]),
    ...profileTerms,
    ...freeTokens,
    ...profiles.map((profile) => profile.label),
    ...(flags.yearTo && flags.yearTo <= 1960 ? ["Μάρκος", "Βαμβακάρης", "Τσιτσάνης", "Παπαϊωάννου", "Χιώτης"] : []),
  ]).slice(0, 30);

  return { original: message.trim(), normalized, profiles, labels: uniqueStrings(labels), searchTerms, artistHints, flags, freeTokens };
}

function songId(item: any): number | null {
  const n = Number(item?.id ?? item?.song_id ?? item?.legacySongId);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function compactCandidate(item: any): SearchCandidate | null {
  const id = songId(item);
  const title = String(item?.title || "").trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    firstLyrics: String(item?.firstLyrics || "").trim(),
    lyrics: String(item?.lyrics || "").trim(),
    characteristics: item?.characteristics == null ? null : String(item.characteristics),
    category: item?.category ?? item?.category_title ?? null,
    categoryTitle: item?.categoryTitle ?? null,
    rythm: item?.rythm ?? null,
    rythmTitle: item?.rythmTitle ?? item?.rhythmTitle ?? null,
    tagTitles: Array.isArray(item?.tagTitles) ? item.tagTitles : null,
    composerName: item?.composerName ?? null,
    lyricistName: item?.lyricistName ?? null,
    singerFrontNames: Array.isArray(item?.singerFrontNames) ? item.singerFrontNames : null,
    singerBackNames: Array.isArray(item?.singerBackNames) ? item.singerBackNames : null,
    yearText: item?.yearText ?? null,
    years: Array.isArray(item?.years) ? item.years : null,
    views: Number.isFinite(Number(item?.views)) ? Number(item.views) : null,
    status: item?.status == null ? null : String(item.status),
    chords: item?.chords,
    partiture: item?.partiture ?? item?.scoreFile,
    hasChords: typeof item?.hasChords === "boolean" ? item.hasChords : null,
    hasScore: typeof item?.hasScore === "boolean" ? item.hasScore : null,
    hasLyrics: typeof item?.hasLyrics === "boolean" ? item.hasLyrics : null,
    isInstrumental: Boolean(item?.isInstrumental),
  };
}

function addIntentFilters(url: URL, intent: SearchIntent) {
  url.searchParams.set("status", intent.flags.pending ? "PENDING_APPROVAL" : "PUBLISHED,PENDING_APPROVAL");
  if (intent.flags.wantsChords !== null) url.searchParams.set("chords", intent.flags.wantsChords ? "1" : "0");
  if (intent.flags.wantsScore !== null) url.searchParams.set("partiture", intent.flags.wantsScore ? "1" : "0");
  if (intent.flags.wantsLyrics === "instrumental") url.searchParams.set("lyrics", "instrumental");
  if (intent.flags.wantsLyrics === "lyrics") url.searchParams.set("lyrics", "1");
  if (intent.flags.wantsLyrics === "noLyrics") url.searchParams.set("lyrics", "0");
  if (intent.flags.popular) url.searchParams.set("popular", "1");
  if (intent.flags.yearFrom !== null) url.searchParams.set("yearFrom", String(intent.flags.yearFrom));
  if (intent.flags.yearTo !== null) url.searchParams.set("yearTo", String(intent.flags.yearTo));
}

async function fetchSongs(term: string, intent: SearchIntent, take = 32): Promise<SearchCandidate[]> {
  const url = new URL(`${getApiBaseUrl()}/songs-es/search`);
  url.searchParams.set("take", String(take));
  url.searchParams.set("skip", "0");
  url.searchParams.set("search_term", term);
  addIntentFilters(url, intent);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];
  return items.map(compactCandidate).filter(Boolean) as SearchCandidate[];
}

function fieldText(candidate: SearchCandidate, field: "title" | "metadata" | "lyrics" | "all") {
  const metadata = [
    candidate.characteristics,
    candidate.category,
    candidate.categoryTitle,
    candidate.rythm,
    candidate.rythmTitle,
    candidate.composerName,
    candidate.lyricistName,
    candidate.yearText,
    ...(candidate.tagTitles || []),
    ...(candidate.singerFrontNames || []),
    ...(candidate.singerBackNames || []),
  ]
    .filter(Boolean)
    .join(" ");
  if (field === "title") return normalizeGreek(candidate.title);
  if (field === "metadata") return normalizeGreek(metadata);
  if (field === "lyrics") return normalizeGreek([candidate.firstLyrics, candidate.lyrics].filter(Boolean).join(" "));
  return normalizeGreek([candidate.title, metadata, candidate.firstLyrics, candidate.lyrics].filter(Boolean).join(" "));
}

function matchTerms(text: string, terms: string[]) {
  return terms.filter((term) => {
    const norm = normalizeGreek(term);
    return norm.length >= 3 && text.includes(norm);
  });
}

function hasTruthyFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.trim() !== "" && value !== "0" && value !== "false";
  return Boolean(value);
}

function rankCandidate(candidate: SearchCandidate, intent: SearchIntent): RankedCandidate {
  const titleText = fieldText(candidate, "title");
  const metadataText = fieldText(candidate, "metadata");
  const lyricsText = fieldText(candidate, "lyrics");
  const allText = fieldText(candidate, "all");

  let score = 0;
  const reasons: string[] = [];

  for (const profile of intent.profiles) {
    let profileScore = 0;
    const profileReasons: string[] = [];

    for (const signal of profile.signals) {
      const titleMatches = matchTerms(titleText, signal.terms);
      const metaMatches = matchTerms(metadataText, signal.terms);
      const lyricMatches = matchTerms(lyricsText, signal.terms);
      const matchedCount = new Set([...titleMatches, ...metaMatches, ...lyricMatches].map(normalizeGreek)).size;
      if (matchedCount > 0) {
        profileScore += signal.points + titleMatches.length * 5 + metaMatches.length * 3 + lyricMatches.length * 1.5;
        profileReasons.push(signal.label);
      }
    }

    for (const signal of profile.negativeSignals || []) {
      if (matchTerms(allText, signal.terms).length > 0) profileScore -= signal.points;
    }

    if (profileScore > 0) {
      score += profileScore;
      reasons.push(...profileReasons);
    }
  }

  for (const token of intent.freeTokens) {
    if (titleText.includes(token)) score += 6;
    else if (metadataText.includes(token)) score += 3;
    else if (lyricsText.includes(token)) score += 1.5;
  }

  for (const artist of intent.artistHints) {
    const aliases = [artist.label, ...artist.aliases];
    const titleMatches = matchTerms(titleText, aliases);
    const metaMatches = matchTerms(metadataText, aliases);
    const lyricMatches = matchTerms(lyricsText, aliases);
    if (titleMatches.length || metaMatches.length || lyricMatches.length) {
      score += metaMatches.length * 18 + titleMatches.length * 10 + lyricMatches.length * 2;
      reasons.push(`σχετίζεται με ${artist.label}`);
    }
  }

  if (intent.flags.wantsChords === true && (candidate.hasChords === true || hasTruthyFlag(candidate.chords))) {
    score += 2;
    reasons.push("έχει συγχορδίες");
  }
  if (intent.flags.wantsScore === true && (candidate.hasScore === true || hasTruthyFlag(candidate.partiture))) {
    score += 2;
    reasons.push("έχει παρτιτούρα");
  }
  if (intent.flags.wantsLyrics === "instrumental" && candidate.isInstrumental) {
    score += 5;
    reasons.push("οργανικό");
  }

  const minYear = Array.isArray(candidate.years) && candidate.years.length ? Math.min(...candidate.years) : null;
  const maxYear = Array.isArray(candidate.years) && candidate.years.length ? Math.max(...candidate.years) : null;
  if (intent.flags.yearFrom !== null || intent.flags.yearTo !== null) {
    const overlapsFrom = intent.flags.yearFrom === null || maxYear === null || maxYear >= intent.flags.yearFrom;
    const overlapsTo = intent.flags.yearTo === null || minYear === null || minYear <= intent.flags.yearTo;
    if (overlapsFrom && overlapsTo) {
      score += 5;
      reasons.push(candidate.yearText ? `ταιριάζει χρονικά (${candidate.yearText})` : "ταιριάζει χρονικά");
    }
  }

  if (intent.flags.programUse) {
    if (candidate.hasChords === true || hasTruthyFlag(candidate.chords)) score += 2;
    if (candidate.views && candidate.views > 20) score += 2;
    reasons.push("χρήσιμο για πρόγραμμα");
  }

  if (candidate.views && candidate.views > 0) score += Math.min(7, Math.log10(candidate.views + 1) * 2);
  if (candidate.status === "PENDING_APPROVAL" && intent.flags.pending) score += 4;

  if (reasons.length === 0 && score > 0) reasons.push("ταιριάζει με λέξεις της αναζήτησης");
  if (reasons.length === 0) reasons.push("πιθανό σχετικό αποτέλεσμα");

  return { ...candidate, aiScore: Math.round(score * 10) / 10, reasons: uniqueStrings(reasons).slice(0, 4) };
}

function buildReply(intent: SearchIntent, ranked: RankedCandidate[]) {
  if (ranked.length === 0) {
    return [
      `Δεν βρήκα καλά υποψήφια αποτελέσματα για «${intent.original}».`,
      "Δοκίμασε να δώσεις ύφος, θέμα, ρυθμό, εποχή, τραγουδιστή ή μία φράση από στίχο.",
    ].join("\n");
  }

  const criteria: string[] = [];
  if (intent.flags.yearFrom !== null || intent.flags.yearTo !== null) {
    criteria.push(
      intent.flags.yearFrom !== null && intent.flags.yearTo !== null
        ? `${intent.flags.yearFrom}-${intent.flags.yearTo}`
        : intent.flags.yearTo !== null
          ? `έως ${intent.flags.yearTo}`
          : `από ${intent.flags.yearFrom}`,
    );
  }
  if (intent.flags.wantsChords === true) criteria.push("με συγχορδίες");
  if (intent.flags.wantsScore === true) criteria.push("με παρτιτούρα");
  if (intent.flags.programUse) criteria.push("για πρόγραμμα/πρόβα");

  const header = intent.labels.length
    ? `Κατάλαβα: ${intent.labels.join(", ")}. Τα πιο πιθανά αποτελέσματα είναι:`
    : `Βρήκα σχετικά αποτελέσματα για «${intent.original}»:`;
  const criteriaLine = criteria.length ? [`Κριτήρια: ${criteria.join(" · ")}`] : [];

  const lines = ranked.slice(0, 10).map((song, index) => {
    const reason = song.reasons.length ? ` — ${song.reasons.join(", ")}` : "";
    return `${index + 1}. #${song.id}: ${song.title}${reason}`;
  });

  return [header, ...criteriaLine, ...lines].join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = String(body?.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Γράψε τι θέλεις να βρω." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (message.length > 500) {
    return NextResponse.json({ error: "Κράτησε την αναζήτηση πιο σύντομη." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const intent = buildIntent(message);
  const seen = new Map<number, SearchCandidate>();
  const terms = intent.searchTerms.length ? intent.searchTerms : [message];

  const batches = await Promise.all(terms.slice(0, 26).map((term) => fetchSongs(term, intent, 28)));
  for (const item of batches.flat()) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }

  // If profile searches were too narrow, add a broad pass with the original query only.
  if (seen.size < 5 && intent.freeTokens.length > 0) {
    const broad = await fetchSongs(intent.freeTokens.join(" "), { ...intent, flags: { ...intent.flags, wantsChords: null, wantsScore: null } }, 50);
    for (const item of broad) {
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
  }

  const ranked = Array.from(seen.values())
    .map((candidate) => rankCandidate(candidate, intent))
    .filter((candidate) => candidate.aiScore > 0)
    .sort((a, b) => b.aiScore - a.aiScore || (b.views || 0) - (a.views || 0))
    .slice(0, 14);

  return NextResponse.json(
    {
      ok: true,
      intent: {
        labels: intent.labels,
        searchTerms: terms.slice(0, 18),
        flags: intent.flags,
      },
      reply: buildReply(intent, ranked),
      results: ranked.map((song) => ({
        id: song.id,
        title: song.title,
        score: song.aiScore,
        reasons: song.reasons,
      })),
    },
    { headers: NO_STORE_HEADERS },
  );
}
