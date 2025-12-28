import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type ReindexState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;

  total: number;
  processed: number;
  indexed: number;
  errors: number;

  lastId: number | null;
  message: string | null;
};

type EsBulkResponse = {
  errors?: boolean;
  items?: any[];
};

@Injectable()
export class ElasticsearchReindexService {
  private readonly ES_BASE = process.env.ES_BASE_URL ?? "http://localhost:9200";
  private readonly INDEX = process.env.ES_SONGS_INDEX ?? "app_songs";
  private readonly BATCH_SIZE = Number(process.env.ES_REINDEX_BATCH_SIZE ?? "500");

  private state: ReindexState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    total: 0,
    processed: 0,
    indexed: 0,
    errors: 0,
    lastId: null,
    message: null,
  };

  constructor(private readonly prisma: PrismaService) {}

  getStatus() {
    return this.state;
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private normalizeText(s: string) {
    // Κρατάμε \n για σταθερότητα (ES/preview/UI)
    return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  /**
   * Αν το stored firstLyrics είναι λάθος (δεν είναι prefix των lyrics),
   * ή είναι άδειο, παράγουμε νέο από την αρχή των lyrics.
   */
  private computeFirstLyrics(firstLyrics: string | null, lyrics: string | null) {
    const fl = (firstLyrics ?? "").trim();
    const ly = (lyrics ?? "").trim();

    if (!ly) return fl || null;

    const flN = this.normalizeText(fl);
    const lyN = this.normalizeText(ly);

    // Αν υπάρχει firstLyrics και είναι prefix => ΟΚ
    if (flN && lyN.startsWith(flN)) return flN;

    // Αλλιώς παράγουμε: πρώτες 2 γραμμές ή μέχρι 120 chars
    const lines = lyN.split("\n").map((x) => x.trim()).filter(Boolean);
    const candidate = (lines.slice(0, 2).join("\n") || lyN).slice(0, 120).trim();

    return candidate || null;
  }

  private buildIndexBody() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        refresh_interval: "1s",
      },
      mappings: {
        dynamic: true,
        properties: {
          id: { type: "integer" },
          legacySongId: { type: "integer" },

          title: { type: "text" },
          firstLyrics: { type: "text" },
          lyrics: { type: "text" },

          characteristics: { type: "text" },
          categoryId: { type: "integer" },
          rythmId: { type: "integer" },

          status: { type: "keyword" },
          scoreFile: { type: "keyword" },
          views: { type: "integer" },
        },
      },
    };
  }

  private async esFetch(path: string, init?: RequestInit) {
    const url = `${this.ES_BASE}${path}`;
    const res = await fetch(url, init);
    const text = await res.text();

    if (!res.ok) {
      throw new HttpException(
        `Elasticsearch error ${res.status}: ${text}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async indexExists(index: string) {
    const res = await fetch(`${this.ES_BASE}/${index}`, { method: "HEAD" });
    return res.ok;
  }

  private async ensureIndexExists(index: string) {
    const exists = await this.indexExists(index);
    if (exists) return;

    await this.esFetch(`/${index}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.buildIndexBody()),
    });
  }

  private async recreateIndex(index: string) {
    const exists = await this.indexExists(index);
    if (exists) {
      await this.esFetch(`/${index}`, { method: "DELETE" });
    }

    await this.esFetch(`/${index}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.buildIndexBody()),
    });
  }

  private async clearIndexDocs(index: string) {
    // Διαγράφει ΜΟΝΟ τα docs, όχι το index/mappings
    await this.esFetch(`/${index}/_delete_by_query?refresh=true&conflicts=proceed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { match_all: {} } }),
    });
  }

  private async bulkIndexBatch(index: string, rows: any[]) {
    const lines: string[] = [];

    for (const s of rows) {
      const lyrics = s.lyrics ?? null;
      const computedFirstLyrics = this.computeFirstLyrics(s.firstLyrics ?? null, lyrics);

      lines.push(JSON.stringify({ index: { _index: index, _id: String(s.id) } }));
      lines.push(
        JSON.stringify({
          id: s.id,
          legacySongId: s.legacySongId ?? null,
          title: s.title ?? null,
          firstLyrics: computedFirstLyrics,
          lyrics: lyrics ? this.normalizeText(lyrics) : null,
          characteristics: (s.characteristics ?? "").toString(),
          categoryId: s.categoryId ?? null,
          rythmId: s.rythmId ?? null,
          views: typeof s.views === "number" ? s.views : 0,
          scoreFile: s.scoreFile ?? null,
          status: s.status ?? null,
        }),
      );
    }

    const ndjson = lines.join("\n") + "\n";

    const res = await fetch(`${this.ES_BASE}/_bulk?refresh=false`, {
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: ndjson,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new HttpException(
        `Elasticsearch bulk HTTP ${res.status}: ${text}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    let json: EsBulkResponse;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HttpException(
        `Elasticsearch bulk returned non-JSON: ${text}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    let batchErrors = 0;
    if (json?.items?.length) {
      for (const it of json.items) {
        const obj = it?.index ?? it?.create ?? it?.update ?? it?.delete;
        if (obj?.error) batchErrors++;
      }
    }

    return { batchErrors };
  }

  /**
   * Εκκίνηση reindex (fire-and-forget).
   * - recreate=true: DELETE+PUT index (καθαρό mapping)
   * - recreate=false: διατηρεί mapping, απλά καθαρίζει docs
   */
  async startReindexNow(opts?: { recreate?: boolean }) {
    if (this.state.running) {
      return { ok: false, message: "Reindex already running", status: this.state };
    }

    this.state = {
      running: true,
      startedAt: this.nowIso(),
      finishedAt: null,
      total: 0,
      processed: 0,
      indexed: 0,
      errors: 0,
      lastId: null,
      message: "Starting reindex...",
    };

    void this.runReindex({ recreate: !!opts?.recreate }).catch((e) => {
      this.state.running = false;
      this.state.finishedAt = this.nowIso();
      this.state.message = `FAILED: ${e?.message ?? String(e)}`;
    });

    return { ok: true, message: "Reindex started", status: this.state };
  }

  private async runReindex(opts: { recreate: boolean }) {
    const index = this.INDEX;

    // 1) index create/ensure
    this.state.message = opts.recreate ? "Recreating index..." : "Ensuring index exists...";
    if (opts.recreate) await this.recreateIndex(index);
    else await this.ensureIndexExists(index);

    // 2) clear docs
    this.state.message = "Clearing documents...";
    await this.clearIndexDocs(index);

    // 3) count
    this.state.message = "Counting songs in Postgres...";
    this.state.total = await this.prisma.song.count();

    // 4) batches
    this.state.message = "Indexing...";
    let lastId = 0;

    while (true) {
      const rows = await this.prisma.song.findMany({
        where: { id: { gt: lastId } },
        orderBy: { id: "asc" },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          legacySongId: true,
          title: true,
          firstLyrics: true,
          lyrics: true,
          characteristics: true,
          categoryId: true,
          rythmId: true,
          views: true,
          scoreFile: true,
          status: true,
        },
      });

      if (!rows.length) break;

      const { batchErrors } = await this.bulkIndexBatch(index, rows);

      this.state.processed += rows.length;
      this.state.errors += batchErrors;
      this.state.indexed += Math.max(0, rows.length - batchErrors);

      lastId = rows[rows.length - 1].id;
      this.state.lastId = lastId;
      this.state.message = `Indexing... lastId=${lastId} (batchErrors=${batchErrors})`;

      // μικρό yield
      await new Promise((r) => setTimeout(r, 5));
    }

    // 5) refresh
    this.state.message = "Refreshing index...";
    await this.esFetch(`/${index}/_refresh`, { method: "POST" });

    this.state.running = false;
    this.state.finishedAt = this.nowIso();
    this.state.message = "DONE";
  }

  async preview(take = 25) {
    const size = Math.min(Math.max(Number(take) || 25, 1), 200);

    const json = await this.esFetch(`/${this.INDEX}/_search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size,
        sort: [{ id: { order: "asc" } }],
        _source: [
          "id",
          "legacySongId",
          "title",
          "firstLyrics",
          "categoryId",
          "rythmId",
          "views",
          "status",
          "scoreFile",
        ],
        query: { match_all: {} },
      }),
    });

    const hits = json?.hits?.hits ?? [];
    const total = json?.hits?.total?.value ?? 0;
    const items = hits.map((h: any) => h?._source ?? {});

    return { total, items };
  }
}
