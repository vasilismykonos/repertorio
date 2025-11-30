// src/songs/songs.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { VersionArtistRole } from "@prisma/client";
import mysql from "mysql2/promise";

@Injectable()
export class SongsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ΔΙΑΒΑΣΜΑ από την ΠΑΛΙΑ MySQL, όπως το παλιό song.php.
   * Χρησιμοποιεί τα ίδια OLD_DB_* env vars με το scripts/migrate-songs.ts.
   */
  private async fetchLegacyComposerLyricist(legacySongId: number): Promise<{
    composerName: string | null;
    lyricistName: string | null;
  }> {
    const {
      OLD_DB_HOST,
      OLD_DB_PORT,
      OLD_DB_USER,
      OLD_DB_PASSWORD,
      OLD_DB_NAME,
    } = process.env;

    // Αν δεν έχουν οριστεί, απλά δεν κάνουμε fallback
    if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
      return { composerName: null, lyricistName: null };
    }

    let connection: mysql.Connection | null = null;

    try {
      connection = await mysql.createConnection({
        host: OLD_DB_HOST,
        port: Number(OLD_DB_PORT || 3306),
        user: OLD_DB_USER,
        password: OLD_DB_PASSWORD,
        database: OLD_DB_NAME,
        charset: "utf8mb4_general_ci",
      });

      const [rows] = await connection.query<any[]>(
        `
        SELECT
          s.Composer          AS ComposerId,
          s.Lyricist          AS LyricistId,

          ac.Title            AS ComposerTitle,
          ac.FirstName        AS ComposerFirstName,
          ac.LastName         AS ComposerLastName,

          al.Title            AS LyricistTitle,
          al.FirstName        AS LyricistFirstName,
          al.LastName         AS LyricistLastName
        FROM songs s
        LEFT JOIN artists ac ON s.Composer = ac.Artist_ID
        LEFT JOIN artists al ON s.Lyricist = al.Artist_ID
        WHERE s.Song_ID = ?
        LIMIT 1
      `,
        [legacySongId],
      );

      if (!rows || rows.length === 0) {
        return { composerName: null, lyricistName: null };
      }

      const row = rows[0];

      const composerFull =
        `${row.ComposerFirstName ?? ""} ${row.ComposerLastName ?? ""}`.trim() ||
        (row.ComposerTitle ? String(row.ComposerTitle).trim() : "");

      const lyricistFull =
        `${row.LyricistFirstName ?? ""} ${row.LyricistLastName ?? ""}`.trim() ||
        (row.LyricistTitle ? String(row.LyricistTitle).trim() : "");

      return {
        composerName: composerFull || null,
        lyricistName: lyricistFull || null,
      };
    } catch (err) {
      console.error(
        "[SongsService] Σφάλμα στο fetchLegacyComposerLyricist για Song_ID",
        legacySongId,
        err,
      );
      return { composerName: null, lyricistName: null };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

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

    // 1) ΝΕΟ schema – VersionArtistRole.COMPOSER
    for (const v of song.versions ?? []) {
      const composerArtist = v.artists?.find(
        (va) => va.role === VersionArtistRole.COMPOSER && va.artist,
      );
      if (composerArtist && composerArtist.artist) {
        const a = composerArtist.artist;
        const fullName =
          `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.title;
        if (fullName) {
          composerName = fullName;
          break;
        }
      }
    }

    // -----------------------------
    // Στιχουργός (lyricistName) – αρχικά null
    // -----------------------------
    let lyricistName: string | null = null;

    // 2) Fallback στην ΠΑΛΙΑ MySQL αν ΔΕΝ έχουμε ακόμα τιμές
    //    Χρησιμοποιούμε legacySongId αν υπάρχει, αλλιώς το id
    if (!composerName || !lyricistName) {
      const legacySongId = song.legacySongId ?? song.id;
      const legacy = await this.fetchLegacyComposerLyricist(legacySongId);

      if (!composerName && legacy.composerName) {
        composerName = legacy.composerName;
      }
      if (!lyricistName && legacy.lyricistName) {
        lyricistName = legacy.lyricistName;
      }
    }

    // 3) Προαιρετικό fallback από legacyComposerOld ΑΝ μοιάζει με όνομα
    if (!composerName) {
      const withLegacy = song.versions?.find(
        (v) => v.legacyComposerOld && v.legacyComposerOld.trim() !== "",
      );
      if (withLegacy) {
        const candidate = withLegacy.legacyComposerOld!.trim();

        const looksLikeCode =
          /^[0-9a-f]{6,}$/i.test(candidate) ||
          candidate.length <= 2 ||
          !/[A-Za-zΑ-Ωα-ω]/.test(candidate);

        if (!looksLikeCode) {
          composerName = candidate;
        }
      }
    }

    // -----------------------------
    // Δισκογραφία (versions) – Α, Β, Σολίστας, YouTube
    // -----------------------------
    const versions = (song.versions ?? []).map((v) => {
      let singerFront: string | null = null;
      let singerBack: string | null = null;
      let solist: string | null = null;

      for (const va of v.artists ?? []) {
        if (!va.artist) continue;
        const a = va.artist;
        const fullName =
          `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.title;

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
      scoreFile: song.scoreFile,

      categoryTitle: song.category ? song.category.title : null,
      composerName,
      lyricistName,
      rythmTitle: song.rythm ? song.rythm.title : null,

      basedOnSongId: null,
      basedOnSongTitle: song.basedOn ?? null,

      views: song.views ?? 0,
      versions,
    };
  }
}
