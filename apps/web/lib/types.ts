export interface Category {
  id: number;
  title: string;
}

export interface Rythm {
  id: number;
  title: string;
}

export interface SongVersionArtist {
  role: string;
  artist: {
    id: number;
    title: string;
  };
}

export interface SongVersion {
  id: number;
  songId: number;
  title: string | null;
  year: number | null;
  youtubeUrl: string | null;
  youtubeSearch: string | null;
  playerCode: string | null;
  artists: SongVersionArtist[];
}

export type SongStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "ARCHIVED";

export interface Song {
  id: number;
  title: string;
  firstLyrics: string | null;
  lyrics: string | null;
  chords: string | null;
  characteristics: string | null;
  status: SongStatus;
  originalKey: string | null;
  basedOn: string | null;
  scoreFile: string | null;
  highestVocalNote: string | null;
  views: number;
  legacySongId: number | null;

  categoryId: number | null;
  rythmId: number | null;
  makamId: number | null;

  category?: Category | null;
  rythm?: Rythm | null;
  versions?: SongVersion[];
}
