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
  category?: string | null;
  categoryTitle?: string | null;
  rythm?: string | null;
  rythmTitle?: string | null;
  tagTitles?: string[] | null;
  views?: number | null;
  status?: string | null;
  chords?: unknown;
  partiture?: unknown;
  isInstrumental?: boolean | null;
};

type RankedCandidate = SearchCandidate & {
  aiScore: number;
  reasons: string[];
};

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

function buildIntent(message: string) {
  const q = normalizeGreek(message);
  const expanded: string[] = [];
  const labels: string[] = [];
  const boosts: Array<{ label: string; terms: string[]; points: number }> = [];

  if (hasAny(q, ["μαγκικ", "μαγκικα", "μαγκες", "μαγκικο"])) {
    labels.push("μάγκικο ύφος");
    expanded.push(
      "μάγκας",
      "μάγκες",
      "μόρτης",
      "νταής",
      "κουτσαβάκης",
      "τεκές",
      "τεκέδες",
      "αργιλές",
      "ναργιλές",
      "χασικλής",
      "φυλακή",
      "πιάτσα",
      "ρεμπέτικο",
      "μπαγλαμάς",
    );
    boosts.push({
      label: "μάγκικο λεξιλόγιο/θεματολογία",
      terms: [
        "μαγκ",
        "μορτ",
        "νταη",
        "κουτσαβακ",
        "τεκε",
        "αργιλε",
        "ναργιλε",
        "χασικ",
        "φυλακ",
        "πιατσα",
        "μπαγλαμ",
      ],
      points: 8,
    });
    boosts.push({ label: "ρεμπέτικο περιβάλλον", terms: ["ρεμπετ"], points: 4 });
  }

  if (hasAny(q, ["ρεμπετικ", "ρεμπετικα"])) {
    labels.push("ρεμπέτικα");
    expanded.push("ρεμπέτικο", "ρεμπέτικα", "μπουζούκι", "μπαγλαμάς", "τεκές");
    boosts.push({ label: "ρεμπέτικη αναφορά", terms: ["ρεμπετ", "μπουζουκ", "μπαγλαμ", "τεκε"], points: 6 });
  }

  if (hasAny(q, ["σμυρναι", "σμυρνεικ"])) {
    labels.push("σμυρναίικο ύφος");
    expanded.push("Σμύρνη", "σμυρναίικο", "σαντούρι", "ούτι", "αμανές");
    boosts.push({ label: "σμυρναίικη αναφορά", terms: ["σμυρν", "σαντουρ", "ουτι", "αμανε"], points: 6 });
  }

  if (hasAny(q, ["οργανικ", "χωρισ στιχ"])) {
    labels.push("χωρίς στίχους/οργανικά");
    boosts.push({ label: "οργανικό", terms: ["οργανικ"], points: 4 });
  }

  if (hasAny(q, ["παρτιτουρ", "score"])) labels.push("με παρτιτούρα");
  if (hasAny(q, ["συγχορδ"])) labels.push("με συγχορδίες");
  if (hasAny(q, ["δημοφιλ"])) labels.push("δημοφιλή");

  const cleanedWords = q
    .split(" ")
    .filter((word) => word.length >= 3)
    .filter((word) => !["βρεσ", "ψαξε", "δειξε", "τραγουδια", "τραγουδι", "μου", "με", "που", "εχουν", "εχει"].includes(word));

  expanded.push(...cleanedWords.slice(0, 8));

  return {
    original: message.trim(),
    normalized: q,
    labels: uniqueStrings(labels),
    searchTerms: uniqueStrings([message.trim(), ...expanded]).slice(0, 18),
    boosts,
  };
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
    category: item?.category ?? item?.category_title ?? null,
    categoryTitle: item?.categoryTitle ?? null,
    rythm: item?.rythm ?? null,
    rythmTitle: item?.rythmTitle ?? item?.rhythmTitle ?? null,
    tagTitles: Array.isArray(item?.tagTitles) ? item.tagTitles : null,
    views: Number.isFinite(Number(item?.views)) ? Number(item.views) : null,
    status: item?.status == null ? null : String(item.status),
    chords: item?.chords,
    partiture: item?.partiture ?? item?.scoreFile,
    isInstrumental: Boolean(item?.isInstrumental),
  };
}

async function fetchSongs(term: string, take = 30): Promise<SearchCandidate[]> {
  const url = new URL(`${getApiBaseUrl()}/songs-es/search`);
  url.searchParams.set("take", String(take));
  url.searchParams.set("skip", "0");
  url.searchParams.set("search_term", term);
  url.searchParams.set("status", "PUBLISHED,PENDING_APPROVAL");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];
  return items.map(compactCandidate).filter(Boolean) as SearchCandidate[];
}

function rankCandidate(candidate: SearchCandidate, intent: ReturnType<typeof buildIntent>): RankedCandidate {
  const haystack = normalizeGreek(
    [
      candidate.title,
      candidate.firstLyrics,
      candidate.lyrics,
      candidate.category,
      candidate.categoryTitle,
      candidate.rythm,
      candidate.rythmTitle,
      ...(candidate.tagTitles || []),
    ]
      .filter(Boolean)
      .join(" "),
  );

  let score = 0;
  const reasons: string[] = [];

  for (const boost of intent.boosts) {
    const matched = boost.terms.filter((term) => haystack.includes(normalizeGreek(term)));
    if (matched.length > 0) {
      score += boost.points + Math.min(6, matched.length * 2);
      reasons.push(boost.label);
    }
  }

  for (const word of intent.normalized.split(" ").filter((w) => w.length >= 4)) {
    if (haystack.includes(word)) score += 2;
  }

  if (candidate.views && candidate.views > 0) score += Math.min(6, Math.log10(candidate.views + 1) * 2);
  if (candidate.chords) score += 1;
  if (candidate.partiture) score += 1;

  if (reasons.length === 0 && score > 0) reasons.push("ταιριάζει με λέξεις της αναζήτησης");
  if (reasons.length === 0) reasons.push("πιθανό σχετικό αποτέλεσμα");

  return { ...candidate, aiScore: Math.round(score * 10) / 10, reasons: uniqueStrings(reasons).slice(0, 3) };
}

function buildReply(intent: ReturnType<typeof buildIntent>, ranked: RankedCandidate[]) {
  if (ranked.length === 0) {
    return [
      `Δεν βρήκα καλά υποψήφια αποτελέσματα για «${intent.original}».`,
      "Δοκίμασε να προσθέσεις ύφος, ρυθμό, εποχή ή κάποιον στίχο.",
    ].join("\n");
  }

  const header = intent.labels.length
    ? `Έψαξα για ${intent.labels.join(", ")} και βρήκα:`
    : `Βρήκα σχετικά αποτελέσματα για «${intent.original}»:`;

  const lines = ranked.slice(0, 10).map((song, index) => {
    const reason = song.reasons.length ? ` — ${song.reasons.join(", ")}` : "";
    return `${index + 1}. #${song.id}: ${song.title}${reason}`;
  });

  return [header, ...lines].join("\n");
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

  const batches = await Promise.all(intent.searchTerms.map((term) => fetchSongs(term, 24)));
  for (const item of batches.flat()) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }

  const ranked = Array.from(seen.values())
    .map((candidate) => rankCandidate(candidate, intent))
    .filter((candidate) => candidate.aiScore > 0)
    .sort((a, b) => b.aiScore - a.aiScore || (b.views || 0) - (a.views || 0))
    .slice(0, 12);

  return NextResponse.json(
    {
      ok: true,
      intent: {
        labels: intent.labels,
        searchTerms: intent.searchTerms,
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
