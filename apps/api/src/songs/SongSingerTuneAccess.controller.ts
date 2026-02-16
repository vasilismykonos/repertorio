// apps/api/src/songs/SongSingerTuneAccess.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Put,
  Req,
  UnauthorizedException,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { SongSingerTuneAccessService } from './SongSingerTuneAccess.service';
import { PrismaService } from '../prisma/prisma.service';

type PutMyAccessBody = {
  creatorUserIds: number[];
};

function normalizeEmail(x: unknown) {
  const s = String(x ?? '')
    .trim()
    .toLowerCase();
  return s || null;
}

function requireInternalKey(req: any) {
  const expected = process.env.INTERNAL_API_KEY || '';
  if (!expected) {
    // Αν δεν έχεις INTERNAL_API_KEY, καλύτερα 500 για να μην ανοίξει “τρύπα”
    throw new UnauthorizedException(
      'Server misconfigured (INTERNAL_API_KEY missing)',
    );
  }

  const got = (req?.headers?.['x-internal-key'] ??
    req?.headers?.['X-Internal-Key']) as string | undefined;
  if (!got || got !== expected) {
    throw new UnauthorizedException('Invalid internal key');
  }
}

@Controller()
export class SongSingerTuneAccessController {
  constructor(
    private readonly svc: SongSingerTuneAccessService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // EXISTING "ME" ENDPOINTS (leave as-is)
  // ---------------------------------------------------------------------------

  @Get('me/singer-tunes/access')
  async getMy(@Req() req: any) {
    const userId = req?.user?.id;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return this.svc.getMyAccess(Number(userId));
  }

  @Put('me/singer-tunes/access')
  async putMy(@Req() req: any, @Body() body: PutMyAccessBody) {
    const userId = req?.user?.id;
    if (!userId) throw new UnauthorizedException('Not authenticated');

    if (!body || !Array.isArray(body.creatorUserIds)) {
      throw new BadRequestException('creatorUserIds must be an array');
    }

    return this.svc.putMyAccess(Number(userId), body.creatorUserIds);
  }

  // ---------------------------------------------------------------------------
  // INTERNAL ENDPOINTS (for Next route handler)
  // Caller must provide:
  //   - x-internal-key: INTERNAL_API_KEY
  //   - x-viewer-email: viewer email
  // ---------------------------------------------------------------------------

  @Get('singer-tunes/access/internal')
  async internalGet(@Req() req: any) {
    requireInternalKey(req);

    const email = normalizeEmail(req?.headers?.['x-viewer-email']);
    if (!email) throw new UnauthorizedException('Missing x-viewer-email');

    const viewer = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });

    if (!viewer?.id) throw new NotFoundException('Viewer not found');

    return this.svc.getMyAccess(viewer.id);
  }

  @Put('singer-tunes/access/internal')
  async internalPut(@Req() req: any, @Body() body: PutMyAccessBody) {
    requireInternalKey(req);

    const email = normalizeEmail(req?.headers?.['x-viewer-email']);
    if (!email) throw new UnauthorizedException('Missing x-viewer-email');

    const viewer = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });

    if (!viewer?.id) throw new NotFoundException('Viewer not found');

    if (!body || !Array.isArray(body.creatorUserIds)) {
      throw new BadRequestException('creatorUserIds must be an array');
    }

    return this.svc.putMyAccess(viewer.id, body.creatorUserIds);
  }
}
