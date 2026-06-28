import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { SongRoadVotesService } from './song-road-votes.service';

type UpsertRoadVoteBody = {
  road?: string | null;
  confidence?: number | string | null;
  note?: string | null;
};

@Controller('songs/:id/road-votes')
export class SongRoadVotesController {
  constructor(private readonly svc: SongRoadVotesService) {}

  private parseSongId(params: any): number {
    const id = Number(params?.id);
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException('Invalid song id');
    return Math.trunc(id);
  }

  private requireInternal(req: any): { viewerEmail: string | null } {
    const key = String(req?.headers?.['x-internal-key'] ?? '').trim();
    const expected = String(process.env.INTERNAL_API_KEY ?? '').trim();
    if (!expected) throw new UnauthorizedException('Server misconfigured');
    if (!key || key !== expected) throw new UnauthorizedException('Invalid internal key');

    const email = String(req?.headers?.['x-viewer-email'] ?? '').trim();
    return { viewerEmail: email || null };
  }

  @Get('internal')
  async summaryInternal(@Req() req: any, @Headers('x-viewer-email') _viewerEmailHeader?: string) {
    const { viewerEmail } = this.requireInternal(req);
    const songId = this.parseSongId(req?.params);
    return this.svc.summary(songId, viewerEmail);
  }

  @Put('internal')
  async upsertInternal(@Req() req: any, @Body() body: UpsertRoadVoteBody) {
    const { viewerEmail } = this.requireInternal(req);
    if (!viewerEmail) throw new UnauthorizedException('Missing viewer email');
    if (!body || typeof body !== 'object') throw new BadRequestException('Invalid body');
    const songId = this.parseSongId(req?.params);
    return this.svc.upsertInternal(songId, viewerEmail, body);
  }
}
