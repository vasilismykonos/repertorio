// apps/api/src/songs/song-singer-tunes.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Query,
  Req,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";
import { SongSingerTunesService } from "./song-singer-tunes.service";

type PutSingerTuneBody = {
  id?: number | null;
  title?: string | null;
  tune: string;
};

type ListScope = "allowed" | "mine";

@Controller("songs/:id/singer-tunes")
export class SongSingerTunesController {
  constructor(private readonly svc: SongSingerTunesService) {}

  private requireUserId(req: any): number {
    const userId = req?.user?.id;
    if (!Number.isFinite(userId) || userId <= 0) {
      // κρατάμε 400 όπως ήδη έχεις
      throw new BadRequestException("Not authenticated");
    }
    return userId;
  }

  private parseSongId(params: any): number {
    const id = Number(params?.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException("Invalid song id");
    }
    return id;
  }

  private parseScope(v: unknown): ListScope {
    return v === "mine" ? "mine" : "allowed";
  }

  // ✅ INTERNAL auth (shared secret + viewer email)
  private requireInternal(req: any): { viewerEmail: string } {
    const key = String(req?.headers?.["x-internal-key"] ?? "").trim();
    const email = String(req?.headers?.["x-viewer-email"] ?? "").trim();

    const expected = String(process.env.INTERNAL_API_KEY ?? "").trim();
    if (!expected) {
      // hard fail: misconfig
      throw new UnauthorizedException("Server misconfigured");
    }

    if (!key || key !== expected) {
      throw new UnauthorizedException("Invalid internal key");
    }
    if (!email) {
      throw new UnauthorizedException("Missing viewer email");
    }

    return { viewerEmail: email };
  }

  /**
   * GET /api/v1/songs/:id/singer-tunes
   * Optional:
   * - ?id=<rowId>
   * - ?scope=mine | allowed
   */
  @Get()
  async list(@Req() req: any, @Query("id") rowId?: string, @Query("scope") scope?: string) {
    const viewerUserId = this.requireUserId(req);
    const songId = this.parseSongId(req?.params);
    const s = this.parseScope(scope);
    return this.svc.listBySongId(songId, viewerUserId, rowId, s);
  }

  /**
   * ✅ GET /api/v1/songs/:id/singer-tunes/internal
   * Headers:
   * - x-internal-key
   * - x-viewer-email
   * Optional query:
   * - ?id=<rowId>
   * - ?scope=mine | allowed
   */
  @Get("internal")
  async listInternal(
    @Req() req: any,
    @Query("id") rowId?: string,
    @Query("scope") scope?: string,
    @Headers("x-viewer-email") _viewerEmailHeader?: string, // (for Nest docs/clarity)
  ) {
    const { viewerEmail } = this.requireInternal(req);
    const songId = this.parseSongId(req?.params);
    const s = this.parseScope(scope);
    return this.svc.listBySongIdInternal(songId, viewerEmail, rowId, s);
  }

  /**
   * PUT /api/v1/songs/:id/singer-tunes
   */
  @Put()
  async upsert(@Req() req: any, @Body() body: PutSingerTuneBody) {
    const viewerUserId = this.requireUserId(req);
    const songId = this.parseSongId(req?.params);

    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid body");
    }
    if (typeof (body as any).tune === "undefined") {
      throw new BadRequestException("Missing tune");
    }

    return this.svc.upsertSingerTune(songId, viewerUserId, body);
  }

  /**
   * ✅ PUT /api/v1/songs/:id/singer-tunes/internal
   * Headers:
   * - x-internal-key
   * - x-viewer-email
   */
  @Put("internal")
  async upsertInternal(@Req() req: any, @Body() body: PutSingerTuneBody) {
    const { viewerEmail } = this.requireInternal(req);
    const songId = this.parseSongId(req?.params);

    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid body");
    }
    if (typeof (body as any).tune === "undefined") {
      throw new BadRequestException("Missing tune");
    }

    return this.svc.upsertSingerTuneInternal(songId, viewerEmail, body);
  }

  /**
   * DELETE /api/v1/songs/:id/singer-tunes?id=<rowId>
   */
  @Delete()
  async del(@Req() req: any, @Query("id") rowId?: string) {
    const viewerUserId = this.requireUserId(req);
    const songId = this.parseSongId(req?.params);
    return this.svc.deleteSingerTune(songId, viewerUserId, rowId);
  }

  /**
   * ✅ DELETE /api/v1/songs/:id/singer-tunes/internal?id=<rowId>
   * Headers:
   * - x-internal-key
   * - x-viewer-email
   */
  @Delete("internal")
  async delInternal(@Req() req: any, @Query("id") rowId?: string) {
    const { viewerEmail } = this.requireInternal(req);
    const songId = this.parseSongId(req?.params);
    return this.svc.deleteSingerTuneInternal(songId, viewerEmail, rowId);
  }
}
