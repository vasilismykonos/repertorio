export type SongDuplicateCandidateRow = {
  id: number;
  title: string | null;
  firstLyrics: string | null;
  lyrics: string | null;
};

export type SongDuplicateCandidateLevel = 'high' | 'medium' | 'low';

export type SongDuplicateCandidateDto = {
  id: number;
  title: string;
  firstLyrics: string | null;
  score: number;
  level: SongDuplicateCandidateLevel;
  reasons: string[];
  matchedText: string | null;
};

type RankInput = {
  title?: string | null;
  firstLyrics?: string | null;
  lyrics?: string | null;
};

const STOP_WORDS = new Set([
  'ο',
  'η',
  'το',
  'οι',
  'τα',
  'του',
  'τη',
  'την',
  'τον',
  'της',
  'τις',
  'τους',
  'των',
  'στο',
  'στη',
  'στην',
  'στον',
  'στα',
  'στις',
  'στουσ',
  'με',
  'σε',
  'για',
  'και',
  'κι',
  'να',
  'θα',
  'που',
  'πως',
  'πιο',
  'μια',
  'μιας',
  'ενα',
  'ενας',
  'εγω',
  'εσυ',
  'μου',
  'σου',
  'μας',
  'σας',
  'δεν',
  'μη',
  'μην',
  'ειναι',
  'ειμαι',
  'απο',
  'ως',
  'σαν',
]);

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('el-GR')
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}#]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNonEmptyLine(value: string | null | undefined): string {
  const lines = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
  for (const line of lines) {
    const clean = line.trim();
    if (clean) return clean;
  }
  return '';
}

function usefulTokens(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function uniqueTokens(tokens: string[]): Set<string> {
  return new Set(tokens);
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const overlap = overlapCount(a, b);
  return overlap / (a.size + b.size - overlap);
}

function containedPhraseLength(
  sourceTokens: string[],
  targetNormalizedText: string,
): number {
  if (sourceTokens.length < 5 || !targetNormalizedText) return 0;

  const maxPhraseLength = Math.min(9, sourceTokens.length);
  for (let length = maxPhraseLength; length >= 5; length -= 1) {
    for (let i = 0; i <= sourceTokens.length - length; i += 1) {
      const phrase = sourceTokens.slice(i, i + length).join(' ');
      if (phrase.length >= 18 && targetNormalizedText.includes(phrase)) {
        return length;
      }
    }
  }

  return 0;
}

function previewText(
  firstLyrics: string | null | undefined,
  lyrics: string | null | undefined,
): string | null {
  const first = String(firstLyrics ?? '').trim() || firstNonEmptyLine(lyrics);
  if (!first) return null;
  return first.length > 180 ? `${first.slice(0, 177)}...` : first;
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function rankSongDuplicateCandidates(
  input: RankInput,
  rows: SongDuplicateCandidateRow[],
  take = 8,
): SongDuplicateCandidateDto[] {
  const title = String(input.title ?? '').trim();
  const lyrics = String(input.lyrics ?? '').trim();
  const firstLyrics =
    String(input.firstLyrics ?? '').trim() || firstNonEmptyLine(lyrics);

  const titleNorm = normalizeText(title);
  const firstNorm = normalizeText(firstLyrics);
  const lyricsNorm = normalizeText(lyrics);

  const titleTokens = usefulTokens(title);
  const firstTokens = usefulTokens(firstLyrics);
  const lyricsTokens = usefulTokens(lyrics);

  const hasEnoughInput =
    titleNorm.length >= 3 || firstNorm.length >= 10 || lyricsTokens.length >= 8;
  if (!hasEnoughInput) return [];

  const titleSet = uniqueTokens(titleTokens);
  const firstSet = uniqueTokens(firstTokens);
  const lyricsSet = uniqueTokens(lyricsTokens);

  const scored: SongDuplicateCandidateDto[] = [];

  for (const row of rows) {
    const rowTitle = String(row.title ?? '').trim();
    const rowFirst = String(row.firstLyrics ?? '').trim() || firstNonEmptyLine(row.lyrics);
    const rowLyrics = String(row.lyrics ?? '').trim();

    const rowTitleNorm = normalizeText(rowTitle);
    const rowFirstNorm = normalizeText(rowFirst);
    const rowLyricsNorm = normalizeText(rowLyrics);

    const rowTitleTokens = usefulTokens(rowTitle);
    const rowFirstTokens = usefulTokens(rowFirst);
    const rowLyricsTokens = usefulTokens(rowLyrics);

    const rowTitleSet = uniqueTokens(rowTitleTokens);
    const rowFirstSet = uniqueTokens(rowFirstTokens);
    const rowLyricsSet = uniqueTokens(rowLyricsTokens);

    const reasons: string[] = [];
    let score = 0;
    let titleSignal = 0;
    let lyricsSignal = 0;

    if (titleNorm && rowTitleNorm) {
      if (titleNorm === rowTitleNorm) {
        titleSignal = 82;
        addReason(reasons, 'Ίδιος τίτλος');
      } else if (
        titleNorm.length >= 8 &&
        (titleNorm.includes(rowTitleNorm) || rowTitleNorm.includes(titleNorm))
      ) {
        titleSignal = 62;
        addReason(reasons, 'Πολύ κοντινός τίτλος');
      } else {
        const titleSimilarity = jaccard(titleSet, rowTitleSet);
        if (titleSimilarity >= 0.75 && titleSet.size >= 2) {
          titleSignal = 58;
          addReason(reasons, 'Παρόμοιος τίτλος');
        } else if (titleSimilarity >= 0.5 && titleSet.size >= 2) {
          titleSignal = 42;
          addReason(reasons, 'Κοινές λέξεις στον τίτλο');
        }
      }
      score = Math.max(score, titleSignal);
    }

    if (firstNorm && rowFirstNorm) {
      if (firstNorm === rowFirstNorm) {
        lyricsSignal = Math.max(lyricsSignal, 90);
        addReason(reasons, 'Ίδιος πρώτος στίχος');
      } else if (
        firstNorm.length >= 18 &&
        (firstNorm.includes(rowFirstNorm) || rowFirstNorm.includes(firstNorm))
      ) {
        lyricsSignal = Math.max(lyricsSignal, 78);
        addReason(reasons, 'Πολύ κοντινός πρώτος στίχος');
      } else {
        const firstSimilarity = jaccard(firstSet, rowFirstSet);
        if (firstSimilarity >= 0.72 && firstSet.size >= 4) {
          lyricsSignal = Math.max(lyricsSignal, 68);
          addReason(reasons, 'Παρόμοιος πρώτος στίχος');
        } else if (firstSimilarity >= 0.5 && firstSet.size >= 4) {
          lyricsSignal = Math.max(lyricsSignal, 50);
          addReason(reasons, 'Κοινές λέξεις στον πρώτο στίχο');
        }
      }
      score = Math.max(score, lyricsSignal);
    }

    if (lyricsTokens.length >= 8 && rowLyricsTokens.length >= 8) {
      const phraseLength = containedPhraseLength(lyricsTokens, rowLyricsNorm);
      if (phraseLength >= 8) {
        lyricsSignal = Math.max(lyricsSignal, 88);
        addReason(reasons, 'Κοινό μεγάλο κομμάτι στίχων');
      } else if (phraseLength >= 5) {
        lyricsSignal = Math.max(lyricsSignal, 74);
        addReason(reasons, 'Κοινή φράση στους στίχους');
      }

      const overlap = overlapCount(lyricsSet, rowLyricsSet);
      const smallerSetSize = Math.min(lyricsSet.size, rowLyricsSet.size);
      const overlapRatio = smallerSetSize > 0 ? overlap / smallerSetSize : 0;

      if (overlapRatio >= 0.78 && overlap >= 10) {
        lyricsSignal = Math.max(lyricsSignal, 86);
        addReason(reasons, 'Οι στίχοι μοιάζουν πολύ');
      } else if (overlapRatio >= 0.58 && overlap >= 8) {
        lyricsSignal = Math.max(lyricsSignal, 64);
        addReason(reasons, 'Αρκετές κοινές λέξεις στους στίχους');
      } else if (overlapRatio >= 0.42 && overlap >= 10) {
        lyricsSignal = Math.max(lyricsSignal, 46);
        addReason(reasons, 'Πιθανή ομοιότητα στίχων');
      }

      score = Math.max(score, lyricsSignal);
    }

    if (titleSignal >= 42 && lyricsSignal >= 50) {
      score = Math.min(100, score + 12);
      addReason(reasons, 'Ταιριάζει και τίτλος και στίχοι');
    }

    if (score < 40) continue;

    const roundedScore = Math.max(0, Math.min(100, Math.round(score)));
    scored.push({
      id: row.id,
      title: rowTitle,
      firstLyrics: rowFirst || null,
      score: roundedScore,
      level: roundedScore >= 78 ? 'high' : roundedScore >= 55 ? 'medium' : 'low',
      reasons,
      matchedText: previewText(rowFirst, rowLyrics),
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'el'))
    .slice(0, Math.max(1, Math.min(20, Math.trunc(take) || 8)));
}
