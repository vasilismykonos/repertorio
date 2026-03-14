//// apps/api/src/assets/assets.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as path from "path";
import * as fs from "fs";

import { AssetsService } from "./assets.service";

const UPLOAD_ROOT = "/home/reperto/uploads/assets";

function safeBaseName(originalName: string) {
  const base = path
    .basename(originalName || "file")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return base || "file";
}

function extLower(originalName: string) {
  const ext = path.extname(originalName || "").toLowerCase();
  return ext || "";
}

/**
 * ✅ Detect AssetType from upload when body.type is missing / GENERIC / OTHER.
 * - .mxl, .musicxml => SCORE
 * - .pdf => PDF
 * (keep it minimal & deterministic)
 */
function detectTypeFromUpload(bodyTypeRaw: any, file?: Express.Multer.File): string {
  const bodyType = String(bodyTypeRaw ?? "").trim().toUpperCase();

  // If client provided an explicit type (not generic/other), honor it.
  if (bodyType && bodyType !== "GENERIC" && bodyType !== "OTHER") return bodyType;

  const ext = file ? extLower(file.originalname) : "";

  // ✅ MusicXML compressed/uncompressed
  if (ext === ".mxl" || ext === ".musicxml") return "SCORE";

  // Common types
  if (ext === ".pdf") return "PDF";

  // If you later want, you can extend here (image/audio), but keep default safe.
  return "GENERIC";
}

function folderForAssetType(type: string) {
  const t = String(type || "").toUpperCase();
  if (t === "PDF") return "pdf";
  if (t === "AUDIO") return "audio";
  if (t === "IMAGE") return "image";
  if (t === "SCORE") return "score";
  return "other";
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function toPositiveInt(v: any): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function toBool(v: any): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).toLowerCase().trim();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return undefined;
}

type AssetLinkTargetType = "SONG" | "LIST" | "LIST_ITEM" | "LIST_GROUP";

function normalizeTargetType(v: any): AssetLinkTargetType {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "SONG" || t === "LIST" || t === "LIST_ITEM" || t === "LIST_GROUP") return t;
  throw new BadRequestException("Invalid targetType");
}

function readAttachTargetFromBody(body: any): { targetType: AssetLinkTargetType; targetId: number } | null {
  // ✅ Unified fields (preferred)
  const attachKindRaw = body?.attachKind;
  const attachIdRaw = body?.attachId;
  if (attachKindRaw !== undefined || attachIdRaw !== undefined) {
    const targetType = normalizeTargetType(attachKindRaw);
    const targetId = toPositiveInt(attachIdRaw);
    if (!targetId) throw new BadRequestException("Missing attachId");
    return { targetType, targetId };
  }

  // ✅ Legacy fields (compatibility)
  const songId = toPositiveInt(body?.songId);
  if (songId) return { targetType: "SONG", targetId: songId };

  const listId = toPositiveInt(body?.listId);
  if (listId) return { targetType: "LIST", targetId: listId };

  const listItemId = toPositiveInt(body?.listItemId);
  if (listItemId) return { targetType: "LIST_ITEM", targetId: listItemId };

  const listGroupId = toPositiveInt(body?.listGroupId);
  if (listGroupId) return { targetType: "LIST_GROUP", targetId: listGroupId };

  return null;
}

@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  /**
   * GET /api/v1/assets
   */
  @Get()
  async list(
    @Query("q") q?: string,
    @Query("kind") kind?: string,
    @Query("type") type?: string,

    @Query("songId") songId?: string,
    @Query("listId") listId?: string,
    @Query("listItemId") listItemId?: string,
    @Query("listGroupId") listGroupId?: string,

    @Query("unlinked") unlinked?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.assetsService.search({
      q,
      kind,
      type,

      songId: toPositiveInt(songId),
      listId: toPositiveInt(listId),
      listItemId: toPositiveInt(listItemId),
      listGroupId: toPositiveInt(listGroupId),

      unlinked: toBool(unlinked) === true,
      page: toPositiveInt(page),
      pageSize: toPositiveInt(pageSize),
    });
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const assetId = Number(id);
    if (!Number.isFinite(assetId)) throw new BadRequestException("Invalid id");
    return this.assetsService.getOne(assetId);
  }

  /**
   * Multipart create (file upload to disk).
   * POST /api/v1/assets/full
   */
  @Post("full")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (req, file, cb) => {
          // ✅ Detect effective type (important for .mxl -> SCORE)
          const effectiveType = detectTypeFromUpload((req as any)?.body?.type, file);
          const folder = folderForAssetType(effectiveType);
          const dest = path.join(UPLOAD_ROOT, folder);
          ensureDir(dest);
          cb(null, dest);
        },
        filename: (req, file, cb) => {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const base = safeBaseName(file.originalname);
          const ext = extLower(base);
          const nameNoExt = ext ? base.slice(0, -ext.length) : base;
          cb(null, `${ts}_${nameNoExt}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ext = extLower(file.originalname);
        const bad = [".exe", ".bat", ".cmd", ".sh", ".php", ".js"];
        if (bad.includes(ext)) {
          return cb(new BadRequestException("Μη επιτρεπτός τύπος αρχείου"), false);
        }
        cb(null, true);
      },
    }),
  )
  async createFull(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: any) {
    const kind = String(body?.kind ?? "").toUpperCase();
    const title = body?.title ?? null;

    if (kind !== "FILE" && kind !== "LINK") throw new BadRequestException("Invalid kind");

    if (kind === "FILE") {
      if (!file) throw new BadRequestException("Missing file");

      // ✅ effective type (auto-detect for mxl/musicxml)
      const type = detectTypeFromUpload(body?.type, file);
      const folder = folderForAssetType(type);
      const rel = `/uploads/assets/${folder}/${file.filename}`;

      const created = await this.assetsService.create({
        kind: "FILE",
        type,
        title,
        url: null,
        filePath: rel,
        mimeType: file.mimetype || null,
        sizeBytes: file.size ? String(file.size) : null,
      });

      // ✅ If caller provided attach target, immediately create join row.
      const attach = readAttachTargetFromBody(body);
      if (attach) {
        return this.assetsService.link({
          assetId: created.id,
          targetType: attach.targetType,
          targetId: attach.targetId,
        });
      }

      return created;
    }

    // LINK
    const type = String(body?.type ?? "GENERIC").toUpperCase();
    const url = String(body?.url ?? "").trim();
    if (!url) throw new BadRequestException("Missing url");
    const created = await this.assetsService.create({
      kind: "LINK",
      type,
      title,
      url,
      filePath: null,
      mimeType: null,
      sizeBytes: null,
    });

    const attach = readAttachTargetFromBody(body);
    if (attach) {
      return this.assetsService.link({
        assetId: created.id,
        targetType: attach.targetType,
        targetId: attach.targetId,
      });
    }

    return created;
  }

  /**
   * Multipart update (optional new file)
   * PATCH /api/v1/assets/:id/full
   */
  @Patch(":id/full")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (req, file, cb) => {
          // ✅ Detect effective type (important for .mxl -> SCORE)
          const effectiveType = detectTypeFromUpload((req as any)?.body?.type, file);
          const folder = folderForAssetType(effectiveType);
          const dest = path.join(UPLOAD_ROOT, folder);
          ensureDir(dest);
          cb(null, dest);
        },
        filename: (req, file, cb) => {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const base = safeBaseName(file.originalname);
          const ext = extLower(base);
          const nameNoExt = ext ? base.slice(0, -ext.length) : base;
          cb(null, `${ts}_${nameNoExt}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ext = extLower(file.originalname);
        const bad = [".exe", ".bat", ".cmd", ".sh", ".php", ".js"];
        if (bad.includes(ext)) {
          return cb(new BadRequestException("Μη επιτρεπτός τύπος αρχείου"), false);
        }
        cb(null, true);
      },
    }),
  )
  async updateFull(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: any,
  ) {
    const assetId = Number(id);
    if (!Number.isFinite(assetId)) throw new BadRequestException("Invalid id");

    const kind = String(body?.kind ?? "").toUpperCase();
    const title = body?.title ?? null;

    if (kind !== "FILE" && kind !== "LINK") throw new BadRequestException("Invalid kind");

    if (kind === "FILE") {
      // ✅ If file is present, detect/normalize type using file extension when body type is generic/other.
      // If no file, keep body.type as-is (or default GENERIC).
      const type = file ? detectTypeFromUpload(body?.type, file) : String(body?.type ?? "GENERIC").toUpperCase();

      let filePath = body?.filePath ?? null;

      if (file) {
        const folder = folderForAssetType(type);
        filePath = `/uploads/assets/${folder}/${file.filename}`;
      }

      const updated = await this.assetsService.update(assetId, {
        kind: "FILE",
        type,
        title,
        url: null,
        filePath,
        mimeType: file ? file.mimetype || null : body?.mimeType ?? null,
        sizeBytes: file ? String(file.size) : body?.sizeBytes ?? null,
      });

      // ✅ If caller provided attach target, ensure join row exists (upsert).
      const attach = readAttachTargetFromBody(body);
      if (attach) {
        return this.assetsService.link({
          assetId: updated.id,
          targetType: attach.targetType,
          targetId: attach.targetId,
        });
      }

      return updated;
    }

    // LINK
    const type = String(body?.type ?? "GENERIC").toUpperCase();
    const url = String(body?.url ?? "").trim();
    if (!url) throw new BadRequestException("Missing url");

    const updated = await this.assetsService.update(assetId, {
      kind: "LINK",
      type,
      title,
      url,
      filePath: null,
      mimeType: null,
      sizeBytes: null,
    });

    const attach = readAttachTargetFromBody(body);
    if (attach) {
      return this.assetsService.link({
        assetId: updated.id,
        targetType: attach.targetType,
        targetId: attach.targetId,
      });
    }

    return updated;
  }

  /**
   * Link asset to entity
   * POST /api/v1/assets/:id/link
   */
  @Post(":id/link")
  async link(@Param("id") id: string, @Body() body: any) {
    const assetId = Number(id);
    if (!Number.isFinite(assetId)) throw new BadRequestException("Invalid id");

    const targetType = normalizeTargetType(body?.targetType);
    const targetId = toPositiveInt(body?.targetId);
    if (!targetId) throw new BadRequestException("Missing targetId");

    const label = body?.label ?? null;
    const sort =
      body?.sort !== undefined && body?.sort !== null && body?.sort !== "" ? Number(body.sort) : undefined;
    const isPrimary = toBool(body?.isPrimary);

    if (sort !== undefined && (!Number.isFinite(sort) || !Number.isInteger(sort))) {
      throw new BadRequestException("Invalid sort");
    }

    return this.assetsService.link({
      assetId,
      targetType,
      targetId,
      label,
      sort,
      isPrimary,
    });
  }

  /**
   * PATCH /api/v1/assets/:id/link
   */
  @Patch(":id/link")
  async updateLink(@Param("id") id: string, @Body() body: any) {
    const assetId = Number(id);
    if (!Number.isFinite(assetId)) throw new BadRequestException("Invalid id");

    const targetType = normalizeTargetType(body?.targetType);
    const targetId = toPositiveInt(body?.targetId);
    if (!targetId) throw new BadRequestException("Missing targetId");

    const label = body?.label ?? undefined;
    const sort = body?.sort === undefined || body?.sort === null || body?.sort === "" ? undefined : Number(body.sort);
    const isPrimary = toBool(body?.isPrimary);

    if (sort !== undefined && (!Number.isFinite(sort) || !Number.isInteger(sort))) {
      throw new BadRequestException("Invalid sort");
    }

    return this.assetsService.updateLink({
      assetId,
      targetType,
      targetId,
      label,
      sort,
      isPrimary,
    });
  }

  /**
   * DELETE /api/v1/assets/:id/link?targetType=...&targetId=...
   */
  @Delete(":id/link")
  async unlink(
    @Param("id") id: string,
    @Query("targetType") targetTypeRaw?: string,
    @Query("targetId") targetIdRaw?: string,
  ) {
    const assetId = Number(id);
    if (!Number.isFinite(assetId)) throw new BadRequestException("Invalid id");

    const targetType = normalizeTargetType(targetTypeRaw);
    const targetId = toPositiveInt(targetIdRaw);
    if (!targetId) throw new BadRequestException("Missing targetId");

    return this.assetsService.unlink({
      assetId,
      targetType,
      targetId,
    });
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const assetId = Number(id);
    if (!Number.isFinite(assetId)) throw new BadRequestException("Invalid id");
    return this.assetsService.remove(assetId);
  }
}