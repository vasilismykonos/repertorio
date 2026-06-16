const DB_NAME = "repertorio-offline";
const DB_VERSION = 1;
const STORE_NAME = "kv";

const KEY_META = "meta";
const KEY_SONGS = "songs";
const KEY_FILTERS = "filters";

export type OfflineCurrentUser = {
  id: number;
  email: string;
  role?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profile?: any | null;
  updatedAt: string;
};

export type OfflineMeta = {
  version: number;
  userId: number | null;
  userEmail: string | null;
  lastSyncedAt: string | null;
  songsSyncedAt: string | null;
  songsFullSyncedAt?: string | null;
  songsChangeCursor?: string | null;
  listsSyncedAt: string | null;
  songsCount: number;
  listsCount: number;
  currentUser?: OfflineCurrentUser | null;
  lastError?: string | null;
};

export type OfflineSongsSnapshot = {
  total: number;
  items: any[];
  detailsById?: Record<string, any>;
  singerTunesBySongId?: Record<string, any[]>;
  searchesByKey?: Record<string, OfflineSongsSearchSnapshot>;
  aggs?: any;
  updatedAt: string;
};

export type OfflineSongsSearchSnapshot = {
  total: number;
  items: any[];
  aggs?: any;
  updatedAt: string;
};

export type OfflineFiltersSnapshot = {
  categories: any[];
  rythms: any[];
  tags: any[];
  updatedAt: string;
};

export type OfflineListsSnapshot = {
  userId: number;
  userEmail: string | null;
  data: any;
  facets: any;
  groupsIndex: any | null;
  detailsById?: Record<string, any>;
  updatedAt: string;
};

export type OfflineSummary = {
  meta: OfflineMeta | null;
  songsCount: number;
  listsCount: number;
  exactSearchesCount: number;
  lastSyncedAt: string | null;
  songsSyncedAt: string | null;
  listsSyncedAt: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function defaultMeta(): OfflineMeta {
  return {
    version: 1,
    userId: null,
    userEmail: null,
    lastSyncedAt: null,
    songsSyncedAt: null,
    songsFullSyncedAt: null,
    songsChangeCursor: null,
    listsSyncedAt: null,
    songsCount: 0,
    listsCount: 0,
    lastError: null,
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}

async function getKey<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const row = await requestToPromise<any>(tx.objectStore(STORE_NAME).get(key));
    return row?.value ?? null;
  } finally {
    db.close();
  }
}

async function setKey<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    await requestToPromise(tx.objectStore(STORE_NAME).put({ key, value, updatedAt: Date.now() }));
  } finally {
    db.close();
  }
}

async function deleteKey(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    await requestToPromise(tx.objectStore(STORE_NAME).delete(key));
  } finally {
    db.close();
  }
}

async function keysWithPrefix(prefix: string): Promise<string[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const keys = await requestToPromise<IDBValidKey[]>(tx.objectStore(STORE_NAME).getAllKeys());
    return keys.map((key) => String(key)).filter((key) => key.startsWith(prefix));
  } finally {
    db.close();
  }
}

async function mergeMeta(patch: Partial<OfflineMeta>): Promise<OfflineMeta> {
  const current = (await getKey<OfflineMeta>(KEY_META)) || defaultMeta();
  const next: OfflineMeta = { ...defaultMeta(), ...current, ...patch, version: 1 };
  await setKey(KEY_META, next);
  return next;
}

function listKey(userId: number) {
  return `lists:${userId}`;
}

function normalizeEmail(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase();
}

export async function readOfflineMeta(): Promise<OfflineMeta | null> {
  return getKey<OfflineMeta>(KEY_META);
}

export async function writeOfflineCurrentUser(user: any): Promise<OfflineCurrentUser | null> {
  const id = Number(user?.id);
  const email = normalizeEmail(user?.email);
  if (!Number.isFinite(id) || id <= 0 || !email) return null;

  const currentUser: OfflineCurrentUser = {
    id: Math.trunc(id),
    email,
    role: user?.role ?? null,
    username: user?.username ?? null,
    displayName: user?.displayName ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    profile: user?.profile ?? null,
    updatedAt: nowIso(),
  };

  await mergeMeta({
    userId: currentUser.id,
    userEmail: currentUser.email,
    currentUser,
    lastError: null,
  });

  return currentUser;
}

export async function readOfflineCurrentUser(): Promise<OfflineCurrentUser | null> {
  const meta = await readOfflineMeta();
  return meta?.currentUser || null;
}

export async function readOfflineSummary(): Promise<OfflineSummary> {
  const meta = await readOfflineMeta();
  const songs = await readOfflineSongs().catch(() => null);
  const exactSearchesCount = Object.keys(songs?.searchesByKey || {}).length;
  return {
    meta,
    songsCount: Number(meta?.songsCount || 0),
    listsCount: Number(meta?.listsCount || 0),
    exactSearchesCount,
    lastSyncedAt: meta?.lastSyncedAt || null,
    songsSyncedAt: meta?.songsSyncedAt || null,
    listsSyncedAt: meta?.listsSyncedAt || null,
  };
}

export async function clearOfflineSyncData(): Promise<void> {
  const current = (await readOfflineMeta().catch(() => null)) || defaultMeta();
  const listKeys = await keysWithPrefix("lists:");

  await Promise.all([
    deleteKey(KEY_SONGS),
    deleteKey(KEY_FILTERS),
    ...listKeys.map((key) => deleteKey(key)),
  ]);

  await setKey<OfflineMeta>(KEY_META, {
    ...defaultMeta(),
    userId: current.userId,
    userEmail: current.userEmail,
    currentUser: current.currentUser || null,
    lastError: null,
  });
}

export async function writeOfflineSongs(payload: {
  total?: number;
  items?: any[];
  aggs?: any;
  detailsById?: Record<string, any>;
  singerTunesBySongId?: Record<string, any[]>;
  searchesByKey?: Record<string, OfflineSongsSearchSnapshot>;
}, options?: {
  markSynced?: boolean;
  markFullSynced?: boolean;
  songsChangeCursor?: string | null;
}): Promise<void> {
  const updatedAt = nowIso();
  const items = Array.isArray(payload.items) ? payload.items : [];
  await setKey<OfflineSongsSnapshot>(KEY_SONGS, {
    total: typeof payload.total === "number" ? payload.total : items.length,
    items,
    detailsById: payload.detailsById || {},
    singerTunesBySongId: payload.singerTunesBySongId || {},
    searchesByKey: payload.searchesByKey || {},
    aggs: payload.aggs || null,
    updatedAt,
  });
  await mergeMeta({
    lastSyncedAt: updatedAt,
    songsCount: items.length,
    lastError: null,
    ...(options?.markSynced === false ? {} : { songsSyncedAt: updatedAt }),
    ...(options?.markFullSynced === false ? {} : { songsFullSyncedAt: updatedAt }),
    ...(Object.prototype.hasOwnProperty.call(options || {}, "songsChangeCursor")
      ? { songsChangeCursor: options?.songsChangeCursor || null }
      : {}),
  });
}

export async function readOfflineSongs(): Promise<OfflineSongsSnapshot | null> {
  return getKey<OfflineSongsSnapshot>(KEY_SONGS);
}

export async function applyOfflineSongChanges(payload: {
  items?: any[];
  removedIds?: Array<number | string>;
  songsChangeCursor?: string | null;
}): Promise<void> {
  const current = await readOfflineSongs();
  const currentItems = Array.isArray(current?.items) ? current.items : [];
  const changed =
    (Array.isArray(payload.items) && payload.items.length > 0) ||
    (Array.isArray(payload.removedIds) && payload.removedIds.length > 0);
  const byId = new Map<string, any>();

  for (const song of currentItems) {
    const id = offlineSongId(song);
    if (!id) continue;
    byId.set(String(id), song);
  }

  for (const idRaw of payload.removedIds || []) {
    const id = Math.trunc(Number(idRaw));
    if (Number.isFinite(id) && id > 0) byId.delete(String(id));
  }

  for (const song of payload.items || []) {
    const id = offlineSongId(song);
    if (!id) continue;
    byId.set(String(id), song);
  }

  const items = Array.from(byId.values()).sort((a, b) => {
    const ai = offlineSongId(a) || 0;
    const bi = offlineSongId(b) || 0;
    return bi - ai;
  });

  await writeOfflineSongs(
    {
      total: items.length,
      items,
      aggs: current?.aggs || null,
      detailsById: current?.detailsById || {},
      singerTunesBySongId: current?.singerTunesBySongId || {},
      searchesByKey: changed ? {} : current?.searchesByKey || {},
    },
    {
      markSynced: true,
      markFullSynced: false,
      songsChangeCursor: payload.songsChangeCursor || null,
    },
  );
}

const SONG_SEARCH_KEY_FIELDS = [
  "q",
  "search_term",
  "take",
  "skip",
  "chords",
  "partiture",
  "category_id",
  "rythm_id",
  "tagIds",
  "listIds",
  "composerIds",
  "lyricistIds",
  "singerFrontIds",
  "singerBackIds",
  "yearFrom",
  "yearTo",
  "lyrics",
  "status",
  "popular",
  "createdByUserId",
];

function normalizeSearchValue(value: any): string {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join(",");
  return String(value ?? "").trim();
}

function offlineSongsSearchKey(filters: any): string {
  const params = new URLSearchParams();
  const q = normalizeSearchValue(filters?.q || filters?.search_term);
  if (q) params.set("q", q);

  for (const key of SONG_SEARCH_KEY_FIELDS) {
    if (key === "q" || key === "search_term") continue;
    const value = normalizeSearchValue(filters?.[key]);
    if (value) params.set(key, value);
  }

  if (!params.has("take")) params.set("take", "50");
  if (!params.has("skip")) params.set("skip", "0");

  return params.toString();
}

export async function writeOfflineSongsSearch(filters: any, response: any): Promise<void> {
  const key = offlineSongsSearchKey(filters);
  if (!key) return;

  const current = await readOfflineSongs().catch(() => null);
  const items = Array.isArray(current?.items) ? current.items : [];
  const updatedAt = nowIso();
  const resultItems = Array.isArray(response?.items) ? response.items : [];

  await setKey<OfflineSongsSnapshot>(KEY_SONGS, {
    total: typeof current?.total === "number" ? current.total : items.length,
    items,
    detailsById: current?.detailsById || {},
    singerTunesBySongId: current?.singerTunesBySongId || {},
    searchesByKey: {
      ...(current?.searchesByKey || {}),
      [key]: {
        total: typeof response?.total === "number" ? response.total : resultItems.length,
        items: resultItems,
        aggs: response?.aggs || null,
        updatedAt,
      },
    },
    aggs: current?.aggs || null,
    updatedAt: current?.updatedAt || updatedAt,
  });
}

function offlineSongId(value: any): number | null {
  const id = Math.trunc(Number(value?.id ?? value?.legacySongId ?? value?.song_id));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function cleanSingerTuneRows(rows: unknown): any[] {
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
}

export async function writeOfflineSongDetail(song: any): Promise<void> {
  const id = offlineSongId(song);
  if (!id) return;

  const current = await readOfflineSongs().catch(() => null);
  const updatedAt = nowIso();
  const items = Array.isArray(current?.items) ? current.items : [];
  const detailsById = { ...(current?.detailsById || {}), [String(id)]: song };

  await setKey<OfflineSongsSnapshot>(KEY_SONGS, {
    total: typeof current?.total === "number" ? current.total : items.length,
    items,
    detailsById,
    singerTunesBySongId: current?.singerTunesBySongId || {},
    searchesByKey: current?.searchesByKey || {},
    aggs: current?.aggs || null,
    updatedAt,
  });
}

export async function readOfflineSingerTunes(songId: number): Promise<any[] | null> {
  const id = Math.trunc(Number(songId));
  if (!Number.isFinite(id) || id <= 0) return null;

  const snapshot = await readOfflineSongs().catch(() => null);
  const rows = snapshot?.singerTunesBySongId?.[String(id)];
  return Array.isArray(rows) ? rows : null;
}

export async function writeOfflineSingerTunes(songId: number, rows: unknown): Promise<void> {
  const id = Math.trunc(Number(songId));
  if (!Number.isFinite(id) || id <= 0) return;

  const current = await readOfflineSongs().catch(() => null);
  const updatedAt = nowIso();
  const items = Array.isArray(current?.items) ? current.items : [];

  await setKey<OfflineSongsSnapshot>(KEY_SONGS, {
    total: typeof current?.total === "number" ? current.total : items.length,
    items,
    detailsById: current?.detailsById || {},
    singerTunesBySongId: {
      ...(current?.singerTunesBySongId || {}),
      [String(id)]: cleanSingerTuneRows(rows),
    },
    searchesByKey: current?.searchesByKey || {},
    aggs: current?.aggs || null,
    updatedAt,
  });
}

export async function writeOfflineStaticFilters(payload: { categories?: any[]; rythms?: any[]; tags?: any[] }): Promise<void> {
  await setKey<OfflineFiltersSnapshot>(KEY_FILTERS, {
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    rythms: Array.isArray(payload.rythms) ? payload.rythms : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    updatedAt: nowIso(),
  });
}

export async function readOfflineStaticFilters(): Promise<OfflineFiltersSnapshot | null> {
  return getKey<OfflineFiltersSnapshot>(KEY_FILTERS);
}

export async function writeOfflineListsForUser(args: {
  userId: number;
  userEmail?: string | null;
  data: any;
  facets?: any;
  groupsIndex?: any | null;
  detailsById?: Record<string, any>;
}, options?: { markSynced?: boolean }): Promise<void> {
  const userId = Number(args.userId);
  if (!Number.isFinite(userId) || userId <= 0) return;

  const updatedAt = nowIso();
  const data = args.data || { items: [], total: 0, page: 1, pageSize: 200, groups: [] };
  const items = Array.isArray(data?.items) ? data.items : [];

  await setKey<OfflineListsSnapshot>(listKey(userId), {
    userId,
    userEmail: args.userEmail || null,
    data,
    facets: args.facets || data,
    groupsIndex: args.groupsIndex || null,
    detailsById: args.detailsById || {},
    updatedAt,
  });

  await mergeMeta({
    userId,
    userEmail: args.userEmail || null,
    lastSyncedAt: updatedAt,
    listsCount: items.length,
    lastError: null,
    ...(options?.markSynced === false ? {} : { listsSyncedAt: updatedAt }),
  });
}

export async function readOfflineListsForEmail(email: string | null | undefined): Promise<OfflineListsSnapshot | null> {
  const wantedEmail = normalizeEmail(email);
  if (!wantedEmail) return null;

  const meta = await readOfflineMeta();
  const metaEmail = normalizeEmail(meta?.userEmail);
  const userId = Number(meta?.userId);

  if (!metaEmail || metaEmail !== wantedEmail) return null;
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const snapshot = await getKey<OfflineListsSnapshot>(listKey(userId));
  if (!snapshot || Number(snapshot.userId) !== userId) return null;
  return snapshot;
}

export async function readOfflineListsForCurrentUser(): Promise<OfflineListsSnapshot | null> {
  const meta = await readOfflineMeta();
  const userId = Number(meta?.userId);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const snapshot = await getKey<OfflineListsSnapshot>(listKey(userId));
  if (!snapshot || Number(snapshot.userId) !== userId) return null;
  return snapshot;
}

export async function recordOfflineSyncError(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error || "Offline sync failed");
  await mergeMeta({ lastError: message });
}

function csvValues(value: any): string[] {
  return String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
}

function numberValue(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value: any): string {
  const noMarks = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return noMarks
    .replace(/[’'`´]/g, "")
    .replace(/[\u2010-\u2015\u2212\-_/]+/g, " ")
    .replace(/[^0-9A-Za-z\u0370-\u03FF\u1F00-\u1FFF]+/g, " ")
    .toLocaleLowerCase("el-GR")
    .replace(/\s+/g, " ")
    .trim();
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function itemIdSet(values: any): Set<string> {
  const out = new Set<string>();
  for (const v of asArray(values)) {
    const n = numberValue(v);
    if (n != null && n > 0) out.add(String(Math.floor(n)));
  }
  return out;
}

function anyCsvMatch(filterCsv: any, values: any): boolean {
  const wanted = csvValues(filterCsv);
  if (wanted.length === 0) return true;
  const set = itemIdSet(values);
  return wanted.some((id) => set.has(id));
}

function oneIdMatch(filterCsv: any, value: any): boolean {
  const wanted = csvValues(filterCsv);
  if (wanted.length === 0) return true;
  const n = numberValue(value);
  if (n == null) return false;
  return wanted.includes(String(Math.floor(n)));
}

function boolish(value: any): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function matchesTri(filterCsv: any, value: any): boolean {
  const wanted = csvValues(filterCsv);
  if (wanted.length === 0) return true;
  const wantsYes = wanted.some((x) => x === "1" || x.toLowerCase() === "true");
  const wantsNo = wanted.some((x) => x === "0" || x.toLowerCase() === "false");
  const actual = boolish(value);
  return (actual && wantsYes) || (!actual && wantsNo);
}

function queryTokens(value: any): string[] {
  const text = normalizeText(value);
  return text ? text.split(" ").filter(Boolean) : [];
}

function fieldTokens(value: any): string[] {
  return queryTokens(value);
}

function fieldText(song: any, fields: string[]): string {
  const values: any[] = [];
  for (const field of fields) {
    const raw = song?.[field];
    if (Array.isArray(raw)) values.push(...raw);
    else values.push(raw);
  }
  return normalizeText(values.join(" "));
}

function fieldHasAllTokens(text: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const words = new Set(fieldTokens(text));
  return tokens.every((token) => words.has(token));
}

function fieldHasPhrasePrefix(text: string, tokens: string[], minLastPrefixLen = 1): boolean {
  if (!tokens.length) return false;
  const words = fieldTokens(text);
  if (!words.length) return false;

  const last = tokens[tokens.length - 1];
  if (!last || last.length < minLastPrefixLen) return false;

  const head = tokens.length === 1 ? [] : tokens.slice(0, -1).filter((token) => token.length >= 2);
  const phrase = [...head, last];
  if (!phrase.length) return false;

  for (let i = 0; i <= words.length - phrase.length; i += 1) {
    let ok = true;
    for (let j = 0; j < phrase.length; j += 1) {
      const expected = phrase[j];
      const actual = words[i + j];
      if (j === phrase.length - 1) {
        if (!actual.startsWith(expected)) ok = false;
      } else if (actual !== expected) {
        ok = false;
      }
      if (!ok) break;
    }
    if (ok) return true;
  }

  return false;
}

function offlineSearchScore(song: any, tokens: string[]): number {
  if (!tokens.length) return 0;

  const title = fieldText(song, ["title"]);
  const firstLyrics = fieldText(song, ["firstLyrics"]);
  const lyrics = fieldText(song, ["lyrics"]);
  const composerName = fieldText(song, ["composerName"]);
  const lyricistName = fieldText(song, ["lyricistName"]);
  const tagTitles = fieldText(song, ["tagTitles"]);

  let score = 0;

  if (fieldHasPhrasePrefix(title, tokens, 1)) score += 3000;
  if (fieldHasPhrasePrefix(firstLyrics, tokens, 1)) score += 1500;
  if (fieldHasPhrasePrefix(lyrics, tokens, 3)) score += 300;

  if (fieldHasAllTokens(title, tokens)) score += 400;
  if (fieldHasAllTokens(firstLyrics, tokens)) score += 200;
  if (fieldHasAllTokens(lyrics, tokens)) score += 100;
  if (fieldHasAllTokens(composerName, tokens)) score += 150;
  if (fieldHasAllTokens(lyricistName, tokens)) score += 150;
  if (fieldHasAllTokens(tagTitles, tokens)) score += 80;

  if (title && title === tokens.join(" ")) score += 500;
  if (title && title.startsWith(tokens.join(" "))) score += 250;

  return score;
}

function songHasLyrics(song: any): boolean {
  if (typeof song?.hasLyrics !== "undefined") return boolish(song.hasLyrics);
  return String(song?.lyrics || "").trim().length > 0;
}

function songYears(song: any): number[] {
  const out: number[] = [];
  for (const y of asArray(song?.years)) {
    const n = numberValue(y);
    if (n != null && n > 0) out.push(Math.floor(n));
  }
  const min = numberValue(song?.minYear);
  const max = numberValue(song?.maxYear);
  if (min != null && min > 0) out.push(Math.floor(min));
  if (max != null && max > 0) out.push(Math.floor(max));
  return Array.from(new Set(out));
}

function singerIdValues(song: any, side: "front" | "back"): number[] {
  const out: number[] = [];
  for (const pair of asArray(song?.versionSingerPairs)) {
    const n = numberValue(side === "front" ? pair?.frontId : pair?.backId);
    if (n != null && n > 0) out.push(Math.floor(n));
  }
  for (const version of asArray(song?.versions)) {
    const n = numberValue(side === "front" ? version?.singerFrontId : version?.singerBackId);
    if (n != null && n > 0) out.push(Math.floor(n));
  }
  return out;
}

function matchesOfflineFilters(song: any, filters: any, tokens: string[]): boolean {
  if (tokens.length > 0 && offlineSearchScore(song, tokens) <= 0) return false;

  if (!matchesTri(filters?.chords, song?.hasChords ?? song?.chords)) return false;
  if (!matchesTri(filters?.partiture, song?.hasScore ?? song?.partiture)) return false;
  if (!matchesTri(filters?.lyrics, songHasLyrics(song))) return false;
  if (!oneIdMatch(filters?.category_id, song?.categoryId ?? song?.category_id)) return false;
  if (!oneIdMatch(filters?.rythm_id, song?.rythmId ?? song?.rythm_id ?? song?.rhythmId ?? song?.rhythm_id)) return false;
  if (!anyCsvMatch(filters?.tagIds, song?.tagIds)) return false;
  if (!anyCsvMatch(filters?.listIds, song?.listIds)) return false;
  if (!oneIdMatch(filters?.composerIds, song?.composerId)) return false;
  if (!oneIdMatch(filters?.lyricistIds, song?.lyricistId)) return false;
  if (!anyCsvMatch(filters?.singerFrontIds, singerIdValues(song, "front"))) return false;
  if (!anyCsvMatch(filters?.singerBackIds, singerIdValues(song, "back"))) return false;

  const statuses = csvValues(filters?.status);
  if (statuses.length > 0 && !statuses.includes(String(song?.status || ""))) return false;

  const from = numberValue(filters?.yearFrom);
  const to = numberValue(filters?.yearTo);
  if ((from != null && from > 0) || (to != null && to > 0)) {
    const years = songYears(song);
    if (years.length === 0) return false;
    const ok = years.some((year) => {
      if (from != null && from > 0 && year < from) return false;
      if (to != null && to > 0 && year > to) return false;
      return true;
    });
    if (!ok) return false;
  }

  if (filters?.createdByUserId && !oneIdMatch(filters.createdByUserId, song?.createdById ?? song?.createdByUserId)) return false;
  return true;
}

function addCount(map: Map<string, { count: number; label?: string }>, key: any, label?: any) {
  const n = numberValue(key);
  if (n == null || n <= 0) return;
  const id = String(Math.floor(n));
  const row = map.get(id) || { count: 0, label: undefined };
  row.count += 1;
  const text = String(label || "").trim();
  if (text && !row.label) row.label = text;
  map.set(id, row);
}

function bucketsFromMap(map: Map<string, { count: number; label?: string }>, nameField?: string) {
  return Array.from(map.entries())
    .map(([key, row]) => {
      const bucket: any = { key: Number(key), doc_count: row.count };
      if (nameField) bucket.topName = { hits: { hits: [{ _source: { [nameField]: row.label || key } }] } };
      return bucket;
    })
    .sort((a, b) => Number(b.doc_count || 0) - Number(a.doc_count || 0));
}

function buildOfflineAggs(items: any[]) {
  const category = new Map<string, { count: number; label?: string }>();
  const rythm = new Map<string, { count: number; label?: string }>();
  const tag = new Map<string, { count: number; label?: string }>();
  const list = new Map<string, { count: number; label?: string }>();
  const composer = new Map<string, { count: number; label?: string }>();
  const lyricist = new Map<string, { count: number; label?: string }>();
  const createdBy = new Map<string, { count: number; label?: string }>();
  const years = new Map<string, { count: number; label?: string }>();
  const status = new Map<string, { count: number; label?: string }>();
  const front = new Map<string, { count: number; label?: string }>();
  const back = new Map<string, { count: number; label?: string }>();
  let hasChords = 0, noChords = 0, hasScore = 0, noScore = 0, hasLyrics = 0, noLyrics = 0;

  for (const song of items) {
    addCount(category, song?.categoryId ?? song?.category_id, song?.categoryTitle ?? song?.category_title ?? song?.category);
    addCount(rythm, song?.rythmId ?? song?.rythm_id ?? song?.rhythmId ?? song?.rhythm_id, song?.rythmTitle ?? song?.rhythmTitle ?? song?.rythm);
    const tagIds = asArray(song?.tagIds);
    const tagTitles = asArray(song?.tagTitles);
    tagIds.forEach((id, idx) => addCount(tag, id, tagTitles[idx]));
    asArray(song?.listIds).forEach((id) => addCount(list, id));
    addCount(composer, song?.composerId, song?.composerName);
    addCount(lyricist, song?.lyricistId, song?.lyricistName);
    addCount(createdBy, song?.createdById, song?.createdByName);
    songYears(song).forEach((year) => addCount(years, year));
    const statusKey = String(song?.status || "").trim();
    if (statusKey) {
      const row = status.get(statusKey) || { count: 0, label: statusKey };
      row.count += 1;
      status.set(statusKey, row);
    }
    for (const pair of asArray(song?.versionSingerPairs)) {
      addCount(front, pair?.frontId, pair?.frontName);
      addCount(back, pair?.backId, pair?.backName);
    }
    if (boolish(song?.hasChords ?? song?.chords)) hasChords += 1; else noChords += 1;
    if (boolish(song?.hasScore ?? song?.partiture)) hasScore += 1; else noScore += 1;
    if (songHasLyrics(song)) hasLyrics += 1; else noLyrics += 1;
  }

  return {
    categoryId: { buckets: bucketsFromMap(category) },
    rythmId: { buckets: bucketsFromMap(rythm) },
    tagIds: { buckets: bucketsFromMap(tag) },
    listIds: { buckets: bucketsFromMap(list) },
    composerId: { buckets: bucketsFromMap(composer, "composerName") },
    lyricistId: { buckets: bucketsFromMap(lyricist, "lyricistName") },
    createdById: { buckets: bucketsFromMap(createdBy, "createdByName") },
    singerFrontId: { byId: { buckets: bucketsFromMap(front, "frontName") } },
    singerBackId: { byId: { buckets: bucketsFromMap(back, "backName") } },
    years: { buckets: bucketsFromMap(years) },
    status: { buckets: Array.from(status.entries()).map(([key, row]) => ({ key, doc_count: row.count })) },
    hasChords: { buckets: [{ key: "1", doc_count: hasChords }, { key: "0", doc_count: noChords }] },
    hasScore: { buckets: [{ key: "1", doc_count: hasScore }, { key: "0", doc_count: noScore }] },
    hasLyrics: { buckets: [{ key: "1", doc_count: hasLyrics }, { key: "0", doc_count: noLyrics }] },
  };
}

function songIdValue(song: any): number | null {
  const id = numberValue(song?.id ?? song?.legacySongId ?? song?.song_id);
  return id != null && id > 0 ? Math.floor(id) : null;
}

function detailSingerPairs(detail: any): any[] {
  const out: any[] = [];
  for (const version of asArray(detail?.versions)) {
    const frontId = numberValue(version?.singerFrontId ?? version?.singer_front_id);
    const backId = numberValue(version?.singerBackId ?? version?.singer_back_id);
    if (frontId == null && backId == null) continue;
    out.push({
      frontId,
      frontName: version?.singerFront ?? version?.singer_front ?? version?.singerFrontName ?? null,
      backId,
      backName: version?.singerBack ?? version?.singer_back ?? version?.singerBackName ?? null,
    });
  }
  return out;
}

function enrichOfflineSong(song: any, detailsById: Record<string, any>): any {
  const id = songIdValue(song);
  if (!id) return song;

  const detail = detailsById[String(id)];
  if (!detail || typeof detail !== "object") return song;

  return {
    ...song,
    versions: Array.isArray(song?.versions) ? song.versions : detail.versions,
    versionSingerPairs:
      Array.isArray(song?.versionSingerPairs) && song.versionSingerPairs.length > 0
        ? song.versionSingerPairs
        : detailSingerPairs(detail),
    createdByUserId: song?.createdByUserId ?? detail.createdByUserId,
  };
}

function sortOfflineSongs(items: any[], tokens: string[], popular: boolean): any[] {
  const scored = items.map((song) => ({
    song,
    score: tokens.length > 0 ? offlineSearchScore(song, tokens) : 0,
    id: songIdValue(song) || 0,
    views: Number(song?.views ?? -1),
  }));

  scored.sort((a, b) => {
    if (popular) {
      if (b.views !== a.views) return b.views - a.views;
      return b.id - a.id;
    }
    if (tokens.length > 0 && b.score !== a.score) return b.score - a.score;
    return b.id - a.id;
  });

  return scored.map((row) => row.song);
}

export async function searchOfflineSongs(filters: any): Promise<{ total: number; items: any[]; aggs: any } | null> {
  const snapshot = await readOfflineSongs();
  const allItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
  if (allItems.length === 0) return null;

  const cachedSearch = snapshot?.searchesByKey?.[offlineSongsSearchKey(filters)];
  if (cachedSearch && Array.isArray(cachedSearch.items)) {
    return {
      total: typeof cachedSearch.total === "number" ? cachedSearch.total : cachedSearch.items.length,
      items: cachedSearch.items,
      aggs: cachedSearch.aggs || {},
    };
  }

  const detailsById = snapshot?.detailsById || {};
  const tokens = queryTokens(filters?.q || filters?.search_term || "");
  const popular = String(filters?.popular || "") === "1";

  const searchableItems = allItems.map((song) => enrichOfflineSong(song, detailsById));
  const matched = sortOfflineSongs(
    searchableItems.filter((song) => matchesOfflineFilters(song, filters, tokens)),
    tokens,
    popular,
  );

  const total = matched.length;
  const skip = Math.max(0, Math.floor(Number(filters?.skip || 0) || 0));
  const takeRaw = Math.floor(Number(filters?.take || 50) || 50);
  const take = takeRaw > 0 ? takeRaw : 50;
  return { total, items: matched.slice(skip, skip + take), aggs: buildOfflineAggs(matched) };
}

function normalizeListForSearch(list: any, groupsById: Map<string, any>): string {
  const group = groupsById.get(String(list?.groupId ?? ""));
  return normalizeText([list?.title, list?.name, list?.listTitle, list?.list_title, group?.title, group?.fullTitle].join(" "));
}

export function buildOfflineListsPage(snapshot: OfflineListsSnapshot, args: {
  search?: string;
  groupId?: string;
  page?: number;
  pageSize?: number;
  recentListId?: number | null;
}) {
  const allItems = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  const sourceGroups = Array.isArray(snapshot?.groupsIndex?.items)
    ? snapshot.groupsIndex.items
    : Array.isArray(snapshot?.data?.groups)
      ? snapshot.data.groups
      : [];
  const groupsById = new Map<string, any>();
  for (const group of sourceGroups) if (group?.id != null) groupsById.set(String(group.id), group);

  const search = normalizeText(args.search || "");
  const groupId = String(args.groupId || "").trim();
  const page = Math.max(1, Math.floor(Number(args.page || 1) || 1));
  const pageSizeRaw = Math.floor(Number(args.pageSize || 50) || 50);
  const pageSize = pageSizeRaw > 0 ? pageSizeRaw : 50;

  const searched = search ? allItems.filter((list: any) => normalizeListForSearch(list, groupsById).includes(search)) : allItems.slice();
  const byGroup = new Map<string, number>();
  for (const list of searched) {
    const key = list?.groupId == null ? "null" : String(list.groupId);
    byGroup.set(key, (byGroup.get(key) || 0) + 1);
  }

  let filtered = searched;
  if (groupId === "null") filtered = searched.filter((list: any) => list?.groupId == null);
  else if (groupId) filtered = searched.filter((list: any) => String(list?.groupId ?? "") === groupId);

  const recentListId = Math.trunc(Number(args.recentListId || 0));
  if (Number.isFinite(recentListId) && recentListId > 0) {
    const idx = filtered.findIndex((list: any) => Math.trunc(Number(list?.id)) === recentListId);
    if (idx > 0) {
      const next = filtered.slice();
      const [recent] = next.splice(idx, 1);
      next.unshift(recent);
      filtered = next;
    }
  }

  const start = (page - 1) * pageSize;
  const groups = sourceGroups.map((group: any) => ({ ...group, listsCount: byGroup.get(String(group.id)) || 0 }));
  const data = { ...(snapshot.data || {}), items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, groups };
  const facets = { ...(snapshot.facets || snapshot.data || {}), items: searched.slice(0, 1), total: searched.length, page: 1, pageSize: 1, groups };
  const groupsIndex = snapshot.groupsIndex ? { ...snapshot.groupsIndex, items: groups } : { items: groups };
  return { data, facets, groupsIndex };
}
