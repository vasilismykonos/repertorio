import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SongCreditRole } from "@prisma/client";

type ReplaceCreditsInput = {
  composerArtistIds: number[];
  lyricistArtistIds: number[];
};

function uniqPositiveInt(ids: number[]) {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const x of ids ?? []) {
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    const i = Math.trunc(n);
    if (i <= 0) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  return out;
}

@Injectable()
export class SongCreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSongCredits(songId: number) {
    const song = await this.prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, title: true },
    });
    if (!song) throw new NotFoundException(`Song with id=${songId} not found`);

    const credits = await this.prisma.songCredit.findMany({
      where: { songId },
      orderBy: [{ role: "asc" }, { id: "asc" }],
      include: { artist: true },
    });

    const composers = credits
      .filter((c) => c.role === "COMPOSER")
      .map((c) => ({
        creditId: c.id,
        artistId: c.artistId,
        title: c.artist.title,
        firstName: c.artist.firstName ?? null,
        lastName: c.artist.lastName ?? null,
      }));

    const lyricists = credits
      .filter((c) => c.role === "LYRICIST")
      .map((c) => ({
        creditId: c.id,
        artistId: c.artistId,
        title: c.artist.title,
        firstName: c.artist.firstName ?? null,
        lastName: c.artist.lastName ?? null,
      }));

    return {
      songId: song.id,
      songTitle: song.title,
      composers,
      lyricists,
    };
  }

  async replaceSongCredits(songId: number, input: ReplaceCreditsInput) {
    const song = await this.prisma.song.findUnique({
      where: { id: songId },
      select: { id: true },
    });
    if (!song) throw new NotFoundException(`Song with id=${songId} not found`);

    const composerIds = uniqPositiveInt(input.composerArtistIds);
    const lyricistIds = uniqPositiveInt(input.lyricistArtistIds);

    // Optional integrity check: οι artists υπάρχουν
    const allIds = uniqPositiveInt([...composerIds, ...lyricistIds]);
    if (allIds.length) {
      const existing = await this.prisma.artist.findMany({
        where: { id: { in: allIds } },
        select: { id: true },
      });
      const existsSet = new Set(existing.map((a) => a.id));
      const missing = allIds.filter((id) => !existsSet.has(id));
      if (missing.length) {
        throw new NotFoundException(`Artists not found: ${missing.join(", ")}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // delete existing for this song
      await tx.songCredit.deleteMany({ where: { songId } });

      // insert new
      if (composerIds.length) {
        await tx.songCredit.createMany({
          data: composerIds.map((artistId) => ({
            songId,
            artistId,
            role: SongCreditRole.COMPOSER,
          })),
          skipDuplicates: true,
        });
      }

      if (lyricistIds.length) {
        await tx.songCredit.createMany({
          data: lyricistIds.map((artistId) => ({
            songId,
            artistId,
            role: SongCreditRole.LYRICIST,
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getSongCredits(songId);
  }
}
