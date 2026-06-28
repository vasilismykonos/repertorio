import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type UpsertRoadVoteInput = {
  road?: string | null;
  confidence?: number | string | null;
  note?: string | null;
};

@Injectable()
export class SongRoadVotesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly makamPrefix = 'Δρόμος:';

  private normalizeRoad(value: unknown): string {
    return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }

  private normalizeConfidence(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 3;
    return Math.max(1, Math.min(5, Math.trunc(n)));
  }

  private normalizeNote(value: unknown): string | null {
    const note = String(value ?? '').trim();
    return note ? note.slice(0, 500) : null;
  }

  private splitCharacteristics(value: string | null | undefined): string[] {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private isMakamCharacteristic(value: string): boolean {
    return /^(μακάμ|μακαμ|δρόμος|δρομος)\s*:/i.test(value.trim());
  }

  private extractMakamFromCharacteristics(value: string | null | undefined): string {
    const direct = this.splitCharacteristics(value).find((item) => this.isMakamCharacteristic(item));
    return direct ? direct.replace(/^(μακάμ|μακαμ|δρόμος|δρομος)\s*:/i, '').trim() : '';
  }

  private setMakamInCharacteristics(value: string | null | undefined, makam: string): string | null {
    const cleanMakam = this.normalizeRoad(makam);
    const rest = this.splitCharacteristics(value).filter((item) => !this.isMakamCharacteristic(item));
    if (cleanMakam) rest.push(`${this.makamPrefix} ${cleanMakam}`);
    return rest.length ? rest.join(', ') : null;
  }

  private async requireViewerUserIdByEmail(viewerEmail: string): Promise<number> {
    const email = String(viewerEmail || '').trim();
    if (!email) throw new BadRequestException('Missing viewer email');

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    if (!user?.id) throw new BadRequestException('Viewer not found');
    return user.id;
  }

  async summary(songId: number, viewerEmail?: string | null) {
    const song = await this.prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, characteristics: true },
    });
    if (!song) throw new NotFoundException('Song not found');

    const viewerUserId = viewerEmail ? await this.requireViewerUserIdByEmail(viewerEmail) : null;

    const rows = await this.prisma.songRoadVote.findMany({
      where: { songId },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        road: true,
        confidence: true,
        note: true,
        userId: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            role: true,
          },
        },
      },
    });

    const byRoad = new Map<string, { road: string; votes: number; score: number; confidenceSum: number }>();
    for (const row of rows) {
      const key = row.road.toLocaleLowerCase('el-GR');
      const current = byRoad.get(key) ?? { road: row.road, votes: 0, score: 0, confidenceSum: 0 };
      const userWeight = row.user?.role === 'ADMIN' ? 2 : 1;
      current.votes += 1;
      current.score += userWeight * row.confidence;
      current.confidenceSum += row.confidence;
      byRoad.set(key, current);
    }

    const totals = Array.from(byRoad.values())
      .map((item) => ({
        road: item.road,
        votes: item.votes,
        score: item.score,
        averageConfidence: item.votes ? Number((item.confidenceSum / item.votes).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.score - a.score || b.votes - a.votes || a.road.localeCompare(b.road, 'el-GR'));

    const myVote = viewerUserId ? rows.find((row) => row.userId === viewerUserId) : null;

    return {
      songId,
      selectedRoad: this.extractMakamFromCharacteristics(song.characteristics),
      characteristics: song.characteristics ?? null,
      totals,
      myVote: myVote
        ? {
            id: myVote.id,
            road: myVote.road,
            confidence: myVote.confidence,
            note: myVote.note,
            updatedAt: myVote.updatedAt,
          }
        : null,
      recentVotes: rows.slice(0, 8).map((row) => ({
        id: row.id,
        road: row.road,
        confidence: row.confidence,
        updatedAt: row.updatedAt,
        user: row.user
          ? {
              id: row.user.id,
              displayName: row.user.displayName,
              username: row.user.username,
            }
          : null,
      })),
    };
  }

  async upsertInternal(songId: number, viewerEmail: string, input: UpsertRoadVoteInput) {
    const viewerUserId = await this.requireViewerUserIdByEmail(viewerEmail);
    const road = this.normalizeRoad(input?.road);
    if (!road) throw new BadRequestException('Missing road');

    const song = await this.prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, characteristics: true },
    });
    if (!song) throw new NotFoundException('Song not found');

    await this.prisma.songRoadVote.upsert({
      where: {
        SongRoadVote_song_user_unique: {
          songId,
          userId: viewerUserId,
        },
      },
      create: {
        songId,
        userId: viewerUserId,
        road,
        confidence: this.normalizeConfidence(input?.confidence),
        note: this.normalizeNote(input?.note),
      },
      update: {
        road,
        confidence: this.normalizeConfidence(input?.confidence),
        note: this.normalizeNote(input?.note),
      },
      select: { id: true },
    });

    await this.refreshSelectedRoad(songId);

    return this.summary(songId, viewerEmail);
  }

  private async refreshSelectedRoad(songId: number) {
    const song = await this.prisma.song.findUnique({
      where: { id: songId },
      select: { characteristics: true },
    });
    if (!song) return;

    const selectedRoad = this.normalizeRoad(this.extractMakamFromCharacteristics(song.characteristics));
    const grouped = await this.prisma.songRoadVote.groupBy({
      by: ['road'],
      where: { songId },
      _count: { road: true },
      orderBy: [{ _count: { road: 'desc' } }, { road: 'asc' }],
    });

    if (!grouped.length) return;

    const selectedKey = selectedRoad.toLocaleLowerCase('el-GR');
    const selectedCount = selectedRoad
      ? grouped.find((item) => item.road.toLocaleLowerCase('el-GR') === selectedKey)?._count.road ?? 0
      : 0;

    const top = grouped[0];
    const topRoad = this.normalizeRoad(top.road);
    const shouldUpdate = !selectedRoad || top._count.road > selectedCount;
    if (!topRoad || !shouldUpdate || topRoad.toLocaleLowerCase('el-GR') === selectedKey) return;

    await this.prisma.song.update({
      where: { id: songId },
      data: {
        characteristics: this.setMakamInCharacteristics(song.characteristics, topRoad),
      },
      select: { id: true },
    });
  }
}
