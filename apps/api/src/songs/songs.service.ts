// src/songs/songs.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VersionArtistRole } from '@prisma/client';

@Injectable()
export class SongsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Επιστρέφει 1 τραγούδι σε μορφή DTO που ταιριάζει
   * με το SongDetail του Next:
   *
   * {
   *   id, title, firstLyrics, lyrics, characteristics, originalKey, chords, status,
   *   categoryTitle, composerName, lyricistName, rythmTitle,
   *   basedOnSongId, basedOnSongTitle, views,
   *   versions: [{ id, year, singerFront, singerBack, solist, youtubeSearch }]
   * }
   */
  async findOne(id: number): Promise<any> {
    const song = await this.prisma.song.findUnique({
      where: { id },
      include: {
        category: true,
        rythm: true,
        versions: {
          include: {
            artists: {
              include: {
                artist: true,
              },
            },
          },
        },
      },
    });

    if (!song) {
      throw new NotFoundException(`Song with id ${id} not found`);
    }

    // -----------------------------
    // Συνθέτης (composerName)
    // -----------------------------
    let composerName: string | null = null;

    // 1) Προσπάθησε να βρεις καλλιτέχνη με ρόλο COMPOSER
    for (const v of song.versions ?? []) {
      const composerArtist = v.artists?.find(
        (va) => va.role === VersionArtistRole.COMPOSER && va.artist,
      );
      if (composerArtist && composerArtist.artist) {
        const a = composerArtist.artist;
        const fullName =
          `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.title;
        if (fullName) {
          composerName = fullName;
          break;
        }
      }
    }

    // 2) Αν δεν βρήκαμε, πέφτουμε στο legacyComposerOld
    if (!composerName) {
      const withLegacy = song.versions?.find(
        (v) => v.legacyComposerOld && v.legacyComposerOld.trim() !== '',
      );
      if (withLegacy) {
        composerName = withLegacy.legacyComposerOld!;
      }
    }

    // -----------------------------
    // Στιχουργός (lyricistName)
    // ΠΡΟΣ ΤΟ ΠΑΡΟΝ δεν υπάρχει στο schema, οπότε null
    // -----------------------------
    const lyricistName: string | null = null;

    // -----------------------------
    // Δισκογραφία (versions)
    // -----------------------------
    const versions = (song.versions ?? []).map((v) => {
      let singerFront: string | null = null;
      let singerBack: string | null = null;
      let solist: string | null = null;

      for (const va of v.artists ?? []) {
        if (!va.artist) continue;
        const a = va.artist;
        const fullName =
          `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.title;

        switch (va.role) {
          case VersionArtistRole.SINGER_FRONT:
            singerFront = fullName;
            break;
          case VersionArtistRole.SINGER_BACK:
            singerBack = fullName;
            break;
          case VersionArtistRole.SOLOIST:
            solist = fullName;
            break;
          default:
            break;
        }
      }

      return {
        id: v.id,
        year: v.year,
        singerFront,
        singerBack,
        solist,
        youtubeSearch: v.youtubeSearch ?? null,
      };
    });

    // -----------------------------
    // Τελικό DTO προς Next
    // -----------------------------
    return {
      id: song.id,
      title: song.title,
      firstLyrics: song.firstLyrics,
      lyrics: song.lyrics,
      characteristics: song.characteristics,
      originalKey: song.originalKey,
      chords: song.chords,
      status: song.status,

      // Expose the optional scoreFile (path to MusicXML/MXL) so the
      // client knows if there is a score to display. Without this
      // property the Next.js frontend cannot determine whether to
      // enable the score button for a song.
      scoreFile: song.scoreFile,

      categoryTitle: song.category ? song.category.title : null,
      composerName,
      lyricistName,
      rythmTitle: song.rythm ? song.rythm.title : null,

      // Στο νέο schema έχουμε μόνο text "basedOn"
      basedOnSongId: null,
      basedOnSongTitle: song.basedOn ?? null,

      views: song.views ?? 0,
      versions,
    };
  }
}
