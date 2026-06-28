// apps/api/src/assets/assets.service.ts
import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AssetKind, AssetType, Prisma } from "@prisma/client";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";

const UPLOAD_ROOT = "/home/reperto/uploads/assets";
const OMR_JOB_ROOT = path.join(UPLOAD_ROOT, "omr-jobs");

function parseEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: any,
): T[keyof T] | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  return (Object.values(enumObj) as string[]).includes(v) ? (v as any) : null;
}

function toBigIntOrNull(v: any): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function toPositiveIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function fileExtLower(value: string | null | undefined): string {
  const clean = String(value || "").split("?")[0].split("#")[0];
  return path.extname(clean).toLowerCase();
}

function uploadFilePathFromPublicPath(filePath: string | null | undefined): string | null {
  const rel = String(filePath || "").trim();
  if (!rel.startsWith("/uploads/assets/")) return null;
  return path.join(UPLOAD_ROOT, rel.slice("/uploads/assets/".length));
}

function publicPathFromUploadFile(absPath: string): string {
  const relative = path.relative(UPLOAD_ROOT, absPath).replace(/\\/g, "/");
  return `/uploads/assets/${relative}`;
}

function safeUploadAbsPath(absPath: string): string {
  const resolved = path.resolve(absPath);
  const root = path.resolve(UPLOAD_ROOT);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new BadRequestException("Unsafe asset path.");
  }
  return resolved;
}

function scoreFilePathFromAsset(asset: any): string | null {
  const filePath = String(asset?.filePath || "").trim();
  if (!filePath) return null;

  if (filePath.startsWith("/uploads/assets/")) {
    return uploadFilePathFromPublicPath(filePath);
  }

  if (filePath.startsWith("/assets/score/")) {
    return path.join("/home/reperto/repertorio/apps/web/public", filePath.slice(1));
  }

  return null;
}

function isEditableScorePath(filePath: string): boolean {
  return [".mxl", ".musicxml", ".xml"].includes(fileExtLower(filePath));
}

function isMusicXmlText(value: string): boolean {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 10 * 1024 * 1024) return false;
  return clean.includes("<score-partwise") || clean.includes("<score-timewise");
}

async function readMusicXmlFromFile(absPath: string): Promise<{ xml: string; sourceFormat: "MXL" | "MUSICXML" }> {
  const ext = fileExtLower(absPath);
  if (ext === ".musicxml" || ext === ".xml") {
    return { xml: await fsp.readFile(absPath, "utf8"), sourceFormat: "MUSICXML" };
  }

  if (ext !== ".mxl") {
    throw new BadRequestException("The score asset must be .mxl, .musicxml or .xml.");
  }

  const zip = await JSZip.loadAsync(await fsp.readFile(absPath));
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => {
      const name = entry.name.toLowerCase();
      return name.endsWith(".xml") && !name.endsWith("container.xml") && !name.includes("__macosx/");
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const scoreEntry = entries[0];
  if (!scoreEntry) throw new BadRequestException("No MusicXML file was found inside the MXL asset.");
  return { xml: await scoreEntry.async("text"), sourceFormat: "MXL" };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function findFirstScoreExport(dir: string): Promise<string | null> {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstScoreExport(full);
      if (nested) files.push(nested);
      continue;
    }
    if (entry.isFile() && [".mxl", ".musicxml", ".xml"].includes(fileExtLower(entry.name))) {
      files.push(full);
    }
  }
  files.sort((a, b) => {
    const ax = fileExtLower(a) === ".mxl" ? 0 : 1;
    const bx = fileExtLower(b) === ".mxl" ? 0 : 1;
    return ax - bx || a.localeCompare(b);
  });
  return files[0] || null;
}

function isScoreSourceAsset(asset: any): boolean {
  const type = String(asset?.type || "").toUpperCase();
  const ext = fileExtLower(asset?.filePath || asset?.url || asset?.title);
  return (
    asset?.kind === "FILE" &&
    (type === "PDF" || type === "IMAGE" || [".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"].includes(ext))
  );
}

type OmrJobState = "queued" | "running" | "succeeded" | "failed";

type OmrJobStatus = {
  id: string;
  assetId: number;
  state: OmrJobState;
  progress: number;
  stage: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  sourceTitle?: string | null;
  sourceFilePath?: string | null;
  outputDir?: string;
  scoreAsset?: any;
  error?: string;
  logs: string[];
};

const OMR_STAGE_PROGRESS: Record<string, number> = {
  LOAD: 5,
  BINARY: 10,
  SCALE: 15,
  GRID: 25,
  HEADERS: 32,
  STEM_SEEDS: 38,
  BEAMS: 44,
  LEDGERS: 50,
  HEADS: 57,
  STEMS: 64,
  REDUCTION: 70,
  CUE_BEAMS: 73,
  TEXTS: 76,
  MEASURES: 82,
  CHORDS: 87,
  CURVES: 90,
  SYMBOLS: 93,
  LINKS: 96,
  RHYTHMS: 98,
  PAGE: 99,
};

function safeJobId(value: string): string {
  const v = String(value || "").trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) throw new BadRequestException("Invalid job id");
  return v;
}

function jobStatusPath(jobId: string): string {
  return path.join(OMR_JOB_ROOT, `${safeJobId(jobId)}.json`);
}

function pushJobLog(job: OmrJobStatus, line: string) {
  const clean = String(line || "").trim();
  if (!clean) return;
  job.logs = [...(job.logs || []), clean].slice(-80);
}

function updateJobFromAudiverisLine(job: OmrJobStatus, line: string) {
  pushJobLog(job, line);
  const stageMatch = line.match(/\|\s+([A-Z_]+)\s*$/);
  const stage = stageMatch?.[1];
  if (stage && OMR_STAGE_PROGRESS[stage] !== undefined) {
    job.stage = stage;
    job.progress = Math.max(job.progress || 0, OMR_STAGE_PROGRESS[stage]);
    job.message = `Audiveris: ${stage}`;
  }
  const sheetMatch = line.match(/\[([^\]]+#\d+)\]/);
  if (sheetMatch?.[1] && job.stage) {
    job.message = `${sheetMatch[1]} - ${job.stage}`;
  }
}

async function writeOmrJob(job: OmrJobStatus) {
  await fsp.mkdir(OMR_JOB_ROOT, { recursive: true });
  job.updatedAt = new Date().toISOString();
  await fsp.writeFile(jobStatusPath(job.id), JSON.stringify(job, null, 2), "utf8");
}

async function readOmrJob(jobId: string): Promise<OmrJobStatus | null> {
  const filePath = jobStatusPath(jobId);
  const raw = await fsp.readFile(filePath, "utf8").catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OmrJobStatus;
  } catch {
    return null;
  }
}

type AssetLinkTargetType = "SONG" | "LIST" | "LIST_ITEM" | "LIST_GROUP";

function mapAsset(a: any) {
  return {
    id: a.id,
    kind: a.kind,
    type: a.type,
    title: a.title,
    url: a.url,
    filePath: a.filePath,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes ? String(a.sizeBytes) : null,
    createdAt: a.createdAt,

    // ✅ Links (ταιριάζει με τα include fields σου)
    songs: (a.SongAsset ?? []).map((sa: any) => sa.Song),
    lists: (a.ListAsset ?? []).map((la: any) => la.list),
    listItems: (a.ListItemAsset ?? []).map((lia: any) => lia.listItem),
    listGroups: (a.ListGroupAsset ?? []).map((lga: any) => lga.listGroup),
  };
}

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async search(params: {
    q?: string;
    kind?: string;
    type?: string;

    songId?: number;
    listId?: number;
    listItemId?: number;
    listGroupId?: number;

    unlinked?: boolean;

    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 50)));
    const skip = (page - 1) * pageSize;

    const q = String(params.q ?? "").trim();
    const kindEnum = parseEnumValue(AssetKind, params.kind);
    const typeEnum = parseEnumValue(AssetType, params.type);

    const songId = toPositiveIntOrNull(params.songId);
    const listId = toPositiveIntOrNull(params.listId);
    const listItemId = toPositiveIntOrNull(params.listItemId);
    const listGroupId = toPositiveIntOrNull(params.listGroupId);

    const unlinked = Boolean(params.unlinked);

    const where: Prisma.AssetWhereInput = {};
    const AND: Prisma.AssetWhereInput[] = [];

    if (q) {
      AND.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { url: { contains: q, mode: "insensitive" } },
          { filePath: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (kindEnum) AND.push({ kind: kindEnum as any });
    if (typeEnum) AND.push({ type: typeEnum as any });

    if (songId) AND.push({ SongAsset: { some: { songId } } });
    if (listId) AND.push({ ListAsset: { some: { listId } } });
    if (listItemId) AND.push({ ListItemAsset: { some: { listItemId } } });
    if (listGroupId) AND.push({ ListGroupAsset: { some: { listGroupId } } });

    const hasAnyEntityFilter = Boolean(songId || listId || listItemId || listGroupId);

    if (unlinked && !hasAnyEntityFilter) {
      AND.push({ SongAsset: { none: {} } });
      AND.push({ ListAsset: { none: {} } });
      AND.push({ ListItemAsset: { none: {} } });
      AND.push({ ListGroupAsset: { none: {} } });
    }

    if (AND.length) where.AND = AND;

    const include = {
      SongAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          Song: { select: { id: true, title: true, slug: true } },
        },
      },
      ListAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          list: { select: { id: true, title: true, legacyId: true, groupId: true } },
        },
      },
      ListItemAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
        },
      },
      ListGroupAsset: {
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }] as any,
        include: {
          listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } },
        },
      },
    } satisfies Prisma.AssetInclude;

    const [total, items] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        include,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map(mapAsset),
    };
  }

  async getOne(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");

    const a = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        SongAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: { Song: { select: { id: true, title: true, slug: true } } },
        },
        ListAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } },
        },
        ListItemAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: {
            listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
          },
        },
        ListGroupAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
        },
      },
    });

    if (!a) throw new NotFoundException("Asset not found");
    return mapAsset(a);
  }

  async getScoreContent(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");

    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Asset not found");
    if (asset.kind !== AssetKind.FILE || asset.type !== AssetType.SCORE) {
      throw new BadRequestException("Only SCORE file assets can be edited as notation.");
    }

    const absPath = scoreFilePathFromAsset(asset);
    if (!absPath || !isEditableScorePath(absPath) || !(await pathExists(absPath))) {
      throw new BadRequestException("Editable score file was not found.");
    }

    const { xml, sourceFormat } = await readMusicXmlFromFile(absPath);
    return {
      id: asset.id,
      title: asset.title,
      filePath: asset.filePath,
      sourceFormat,
      xml,
    };
  }

  async saveScoreContent(id: number, xml: string) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");
    if (!isMusicXmlText(xml)) throw new BadRequestException("Invalid MusicXML content.");

    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Asset not found");
    if (asset.kind !== AssetKind.FILE || asset.type !== AssetType.SCORE) {
      throw new BadRequestException("Only SCORE file assets can be edited as notation.");
    }

    const currentAbsPath = scoreFilePathFromAsset(asset);
    if (!currentAbsPath || !isEditableScorePath(currentAbsPath) || !(await pathExists(currentAbsPath))) {
      throw new BadRequestException("Editable score file was not found.");
    }

    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(UPLOAD_ROOT, "score", "_backups", String(id));
    await fsp.mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${now}_${path.basename(currentAbsPath)}`);
    await fsp.copyFile(currentAbsPath, backupPath);

    const outputDir = path.join(UPLOAD_ROOT, "score", "edited");
    await fsp.mkdir(outputDir, { recursive: true });
    const safeTitle = String(asset.title || `asset-${id}`)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .slice(0, 80) || `asset-${id}`;
    const outputPath = safeUploadAbsPath(path.join(outputDir, `${now}_${safeTitle}.musicxml`));
    const normalizedXml = xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
    await fsp.writeFile(outputPath, normalizedXml, "utf8");
    const stat = await fsp.stat(outputPath);

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        filePath: publicPathFromUploadFile(outputPath),
        mimeType: "application/vnd.recordare.musicxml+xml",
        sizeBytes: BigInt(stat.size),
      },
      include: {
        SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
        ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
        ListItemAsset: {
          include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } },
        },
        ListGroupAsset: {
          include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
        },
      },
    });

    return {
      ok: true,
      asset: mapAsset(updated),
      backupPath: publicPathFromUploadFile(backupPath),
    };
  }

  async create(data: {
    kind: AssetKind | "FILE" | "LINK";
    type: AssetType | string;
    title?: string | null;
    url?: string | null;
    filePath?: string | null;
    mimeType?: string | null;
    sizeBytes?: string | number | bigint | null;
  }) {
    const kindEnum = parseEnumValue(AssetKind, data.kind);
    if (!kindEnum) throw new BadRequestException("Invalid kind");

    const typeEnum = parseEnumValue(AssetType, data.type) ?? AssetType.GENERIC;

    const created = await this.prisma.asset.create({
      data: {
        kind: kindEnum as any,
        type: typeEnum as any,
        title: data.title ?? null,
        url: data.url ?? null,
        filePath: data.filePath ?? null,
        mimeType: data.mimeType ?? null,
        sizeBytes: toBigIntOrNull(data.sizeBytes),
      },
      include: {
        SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
        ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
        ListItemAsset: {
          include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } },
        },
        ListGroupAsset: {
          include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
        },
      },
    });

    return mapAsset(created);
  }

  async update(
    id: number,
    data: {
      kind: AssetKind | "FILE" | "LINK";
      type: AssetType | string;
      title?: string | null;
      url?: string | null;
      filePath?: string | null;
      mimeType?: string | null;
      sizeBytes?: string | number | bigint | null;
    },
  ) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");

    const kindEnum = parseEnumValue(AssetKind, data.kind);
    if (!kindEnum) throw new BadRequestException("Invalid kind");

    const typeEnum = parseEnumValue(AssetType, data.type) ?? AssetType.GENERIC;

    const exists = await this.prisma.asset.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Asset not found");

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        kind: kindEnum as any,
        type: typeEnum as any,
        title: data.title ?? null,
        url: data.url ?? null,
        filePath: data.filePath ?? null,
        mimeType: data.mimeType ?? null,
        sizeBytes: toBigIntOrNull(data.sizeBytes),
      },
      include: {
        SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
        ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
        ListItemAsset: {
          include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } },
        },
        ListGroupAsset: {
          include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
        },
      },
    });

    return mapAsset(updated);
  }

  async remove(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");
    await this.prisma.asset.delete({ where: { id } });
    return { ok: true };
  }

  async startOmrJob(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("Invalid id");

    const source = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        SongAsset: {
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: { Song: { select: { id: true, title: true, slug: true } } },
        },
      },
    });
    if (!source) throw new NotFoundException("Asset not found");
    if (!isScoreSourceAsset(source)) {
      throw new BadRequestException("OMR can run only on PDF or image score assets.");
    }

    const audiverisBin = String(process.env.AUDIVERIS_BIN || "/usr/local/bin/audiveris").trim();
    if (!audiverisBin || !(await pathExists(audiverisBin))) {
      throw new BadRequestException("OMR engine is not configured. Set AUDIVERIS_BIN to an executable Audiveris wrapper.");
    }

    const inputPath = uploadFilePathFromPublicPath(source.filePath);
    if (!inputPath || !(await pathExists(inputPath))) {
      throw new BadRequestException("Source file was not found on disk.");
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jobId = `${source.id}-${stamp}-${randomUUID().slice(0, 8)}`;
    const outputDir = path.join(UPLOAD_ROOT, "score", `omr-${jobId}`);
    await fsp.mkdir(outputDir, { recursive: true });

    const now = new Date().toISOString();
    const job: OmrJobStatus = {
      id: jobId,
      assetId: source.id,
      state: "queued",
      progress: 0,
      stage: "QUEUED",
      message: "Queued",
      createdAt: now,
      updatedAt: now,
      sourceTitle: source.title ?? null,
      sourceFilePath: source.filePath ?? null,
      outputDir,
      logs: [],
    };
    await writeOmrJob(job);

    void this.runOmrJob(job, {
      audiverisBin,
      inputPath,
      outputDir,
      sourceTitle: String(source.title || source.filePath || `Asset ${source.id}`).trim(),
      sourceSongLinks: source.SongAsset || [],
    });

    return { ok: true, job };
  }

  async getOmrJob(jobId: string) {
    const job = await readOmrJob(jobId);
    if (!job) throw new NotFoundException("OMR job not found");
    return job;
  }

  private async runOmrJob(
    job: OmrJobStatus,
    input: {
      audiverisBin: string;
      inputPath: string;
      outputDir: string;
      sourceTitle: string;
      sourceSongLinks: Array<{ songId: number; sort: number | null }>;
    },
  ) {
    const update = async (patch: Partial<OmrJobStatus>) => {
      Object.assign(job, patch);
      await writeOmrJob(job);
    };

    try {
      await update({ state: "running", progress: 1, stage: "START", message: "Starting Audiveris" });

      await new Promise<void>((resolve, reject) => {
        let lastProgressWrite = 0;
        const child = spawn(input.audiverisBin, ["-batch", "-export", "-output", input.outputDir, input.inputPath], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error("OMR timed out after 30 minutes."));
        }, 30 * 60 * 1000);

        const consume = (chunk: Buffer) => {
          for (const line of chunk.toString("utf8").split(/\r?\n/)) {
            if (!line.trim()) continue;
            updateJobFromAudiverisLine(job, line);
            const now = Date.now();
            if (now - lastProgressWrite >= 1000) {
              lastProgressWrite = now;
              void writeOmrJob(job);
            }
          }
        };

        child.stdout.on("data", consume);
        child.stderr.on("data", consume);
        child.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve();
          else reject(new Error(`Audiveris exited with code ${code ?? "unknown"}.`));
        });
      });

      await update({ progress: 99, stage: "EXPORT", message: "Looking for MusicXML export" });
      const exported = await findFirstScoreExport(input.outputDir);
      if (!exported) throw new Error("Audiveris finished but no MusicXML/MXL file was found.");

      const stat = await fsp.stat(exported);
      const created = await this.create({
        kind: "FILE",
        type: "SCORE",
        title: `${input.sourceTitle} - OMR`,
        url: null,
        filePath: publicPathFromUploadFile(exported),
        mimeType:
          fileExtLower(exported) === ".mxl"
            ? "application/vnd.recordare.musicxml"
            : "application/vnd.recordare.musicxml+xml",
        sizeBytes: stat.size,
      });

      for (const link of input.sourceSongLinks) {
        await this.link({
          assetId: created.id,
          targetType: "SONG",
          targetId: link.songId,
          label: "Score: OMR",
          sort: Number(link.sort || 0) + 1,
          isPrimary: false,
        });
      }

      await update({
        state: "succeeded",
        progress: 100,
        stage: "DONE",
        message: "OMR completed",
        finishedAt: new Date().toISOString(),
        scoreAsset: await this.getOne(created.id),
      });
    } catch (error: any) {
      pushJobLog(job, String(error?.message || error || "OMR failed."));
      await update({
        state: "failed",
        progress: Math.max(1, job.progress || 0),
        stage: "FAILED",
        message: "OMR failed",
        error: String(error?.message || error || "OMR failed."),
        finishedAt: new Date().toISOString(),
      });
    }
  }

  /* =========================================================
     NEW: Link / UpdateLink / Unlink (για AssetsController)
  ========================================================= */

  async link(input: {
    assetId: number;
    targetType: AssetLinkTargetType;
    targetId: number;
    label?: string | null;
    sort?: number;
    isPrimary?: boolean;
  }) {
    const assetId = Number(input.assetId);
    const targetId = Number(input.targetId);
    if (!Number.isFinite(assetId) || assetId <= 0) throw new BadRequestException("Invalid assetId");
    if (!Number.isFinite(targetId) || targetId <= 0) throw new BadRequestException("Invalid targetId");

    // validate asset exists
    const a = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!a) throw new NotFoundException("Asset not found");

    const label = input.label ?? null;
    const sort = input.sort ?? 0;
    const isPrimary = input.isPrimary ?? false;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        // clear other primaries for same target
        await this.clearPrimary(tx, input.targetType, targetId);
      }

      switch (input.targetType) {
        case "SONG": {
          // optional: validate song exists
          await tx.song.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("Song not found");
          });

          await tx.songAsset.upsert({
            where: { songId_assetId: { songId: targetId, assetId } },
            create: { songId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        case "LIST": {
          await tx.list.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("List not found");
          });

          await tx.listAsset.upsert({
            where: { listId_assetId: { listId: targetId, assetId } },
            create: { listId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        case "LIST_ITEM": {
          await tx.listItem.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("ListItem not found");
          });

          await tx.listItemAsset.upsert({
            where: { listItemId_assetId: { listItemId: targetId, assetId } },
            create: { listItemId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        case "LIST_GROUP": {
          await tx.listGroup.findUnique({ where: { id: targetId }, select: { id: true } }).then((x) => {
            if (!x) throw new NotFoundException("ListGroup not found");
          });

          await tx.listGroupAsset.upsert({
            where: { listGroupId_assetId: { listGroupId: targetId, assetId } },
            create: { listGroupId: targetId, assetId, label, sort, isPrimary },
            update: { label, sort, isPrimary },
          });
          break;
        }

        default:
          throw new BadRequestException("Invalid targetType");
      }

      // return updated asset with links
      const full = await tx.asset.findUnique({
        where: { id: assetId },
        include: {
          SongAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { Song: { select: { id: true, title: true, slug: true } } },
          },
          ListAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } },
          },
          ListItemAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: {
              listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
            },
          },
          ListGroupAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
          },
        },
      });

      if (!full) throw new NotFoundException("Asset not found");
      return mapAsset(full);
    });
  }

  async updateLink(input: {
    assetId: number;
    targetType: AssetLinkTargetType;
    targetId: number;
    label?: string | null;
    sort?: number;
    isPrimary?: boolean;
  }) {
    const assetId = Number(input.assetId);
    const targetId = Number(input.targetId);
    if (!Number.isFinite(assetId) || assetId <= 0) throw new BadRequestException("Invalid assetId");
    if (!Number.isFinite(targetId) || targetId <= 0) throw new BadRequestException("Invalid targetId");

    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        await this.clearPrimary(tx, input.targetType, targetId);
      }

      // build partial update
      const data: any = {};
      if (input.label !== undefined) data.label = input.label;
      if (input.sort !== undefined) data.sort = input.sort;
      if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary;

      if (!Object.keys(data).length) {
        // nothing to update, just return asset
        const full = await tx.asset.findUnique({
          where: { id: assetId },
          include: {
            SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
            ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
            ListItemAsset: { include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } } },
            ListGroupAsset: { include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } } },
          },
        });
        if (!full) throw new NotFoundException("Asset not found");
        return mapAsset(full);
      }

      switch (input.targetType) {
        case "SONG":
          await tx.songAsset.update({
            where: { songId_assetId: { songId: targetId, assetId } },
            data,
          });
          break;

        case "LIST":
          await tx.listAsset.update({
            where: { listId_assetId: { listId: targetId, assetId } },
            data,
          });
          break;

        case "LIST_ITEM":
          await tx.listItemAsset.update({
            where: { listItemId_assetId: { listItemId: targetId, assetId } },
            data,
          });
          break;

        case "LIST_GROUP":
          await tx.listGroupAsset.update({
            where: { listGroupId_assetId: { listGroupId: targetId, assetId } },
            data,
          });
          break;

        default:
          throw new BadRequestException("Invalid targetType");
      }

      const full = await tx.asset.findUnique({
        where: { id: assetId },
        include: {
          SongAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { Song: { select: { id: true, title: true, slug: true } } },
          },
          ListAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } },
          },
          ListItemAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: {
              listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } },
            },
          },
          ListGroupAsset: {
            orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
            include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } },
          },
        },
      });

      if (!full) throw new NotFoundException("Asset not found");
      return mapAsset(full);
    });
  }

  async unlink(input: { assetId: number; targetType: AssetLinkTargetType; targetId: number }) {
    const assetId = Number(input.assetId);
    const targetId = Number(input.targetId);
    if (!Number.isFinite(assetId) || assetId <= 0) throw new BadRequestException("Invalid assetId");
    if (!Number.isFinite(targetId) || targetId <= 0) throw new BadRequestException("Invalid targetId");

    await this.prisma.$transaction(async (tx) => {
      switch (input.targetType) {
        case "SONG":
          await tx.songAsset.delete({ where: { songId_assetId: { songId: targetId, assetId } } });
          break;

        case "LIST":
          await tx.listAsset.delete({ where: { listId_assetId: { listId: targetId, assetId } } });
          break;

        case "LIST_ITEM":
          await tx.listItemAsset.delete({ where: { listItemId_assetId: { listItemId: targetId, assetId } } });
          break;

        case "LIST_GROUP":
          await tx.listGroupAsset.delete({ where: { listGroupId_assetId: { listGroupId: targetId, assetId } } });
          break;

        default:
          throw new BadRequestException("Invalid targetType");
      }
    });

    // return asset after unlink
    const full = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        SongAsset: { include: { Song: { select: { id: true, title: true, slug: true } } } },
        ListAsset: { include: { list: { select: { id: true, title: true, legacyId: true, groupId: true } } } },
        ListItemAsset: { include: { listItem: { select: { id: true, title: true, listId: true, sortId: true, songId: true } } } },
        ListGroupAsset: { include: { listGroup: { select: { id: true, title: true, fullTitle: true, legacyId: true } } } },
      },
    });

    if (!full) throw new NotFoundException("Asset not found");
    return mapAsset(full);
  }

  private async clearPrimary(tx: Prisma.TransactionClient, targetType: AssetLinkTargetType, targetId: number) {
    switch (targetType) {
      case "SONG":
        await tx.songAsset.updateMany({ where: { songId: targetId, isPrimary: true }, data: { isPrimary: false } });
        return;
      case "LIST":
        await tx.listAsset.updateMany({ where: { listId: targetId, isPrimary: true }, data: { isPrimary: false } });
        return;
      case "LIST_ITEM":
        await tx.listItemAsset.updateMany({
          where: { listItemId: targetId, isPrimary: true },
          data: { isPrimary: false },
        });
        return;
      case "LIST_GROUP":
        await tx.listGroupAsset.updateMany({
          where: { listGroupId: targetId, isPrimary: true },
          data: { isPrimary: false },
        });
        return;
      default:
        return;
    }
  }
}
