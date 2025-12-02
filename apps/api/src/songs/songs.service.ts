// src/songs/songs.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
export enum VersionArtistRole {
  SINGER_FRONT = "SINGER_FRONT",
  SINGER_BACK = "SINGER_BACK",
  SOLOIST = "SOLOIST",
  MUSICIAN = "MUSICIAN",
  COMPOSER = "COMPOSER",
  LYRICIST = "LYRICIST",
}

import mysql from "mysql2/promise";

@Injectable()
export class SongsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ΔΙΑΒΑΣΜΑ από την ΠΑΛΙΑ MySQL, όπως το παλιό song.php.
   * Χρησιμοποιεί τα ίδια OLD_DB_* env vars με το scripts/migrate-songs.ts.
   */
  private async fetchLegacyComposerLyricist(
    legacySongId: number,
  ): Promise<{ composerName: string | null; lyricistName: string | null }> {
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
   * Fallback Κατηγορία από ΠΑΛΙΑ MySQL (songs + songs_categories).
   */
  private async fetchLegacyCategoryTitle(
    legacySongId: number,
  ): Promise<string | null> {
    const {
      OLD_DB_HOST,
      OLD_DB_PORT,
      OLD_DB_USER,
      OLD_DB_PASSWORD,
      OLD_DB_NAME,
    } = process.env;

    if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
      return null;
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
        SELECT c.Title AS CategoryTitle
        FROM songs s
        LEFT JOIN songs_categories c ON s.Category_ID = c.Category_ID
        WHERE s.Song_ID = ?
        LIMIT 1
      `,
        [legacySongId],
      );

      if (!rows || rows.length === 0) {
        return null;
      }

      const title = rows[0].CategoryTitle;
      if (!title) {
        return null;
      }

      const trimmed = String(title).trim();
      return trimmed !== "" ? trimmed : null;
    } catch (err) {
      console.error(
        "[SongsService] Σφάλμα στο fetchLegacyCategoryTitle για Song_ID",
        legacySongId,
        err,
      );
      return null;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * Fallback Προβολές (views) από ΠΑΛΙΑ MySQL (songs).
   * Ξέρουμε ότι το πεδίο λέγεται Count_Views.
   */
  private async fetchLegacyViews(legacySongId: number): Promise<number | null> {
    const {
      OLD_DB_HOST,
      OLD_DB_PORT,
      OLD_DB_USER,
      OLD_DB_PASSWORD,
      OLD_DB_NAME,
    } = process.env;

    if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
      return null;
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
        SELECT Count_Views
        FROM songs
        WHERE Song_ID = ?
        LIMIT 1
      `,
        [legacySongId],
      );

      if (!rows || rows.length === 0) {
        return null;
      }

      const row = rows[0] as any;
      const value = row.Count_Views;

      if (value === undefined || value === null) {
        return null;
      }

      const num = Number(value);
      if (Number.isNaN(num) || num < 0) {
        return null;
      }

      return num;
    } catch (err) {
      console.error(
        "[SongsService] Σφάλμα στο fetchLegacyViews για Song_ID",
        legacySongId,
        err,
      );
      return null;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
  /**
   * Βασισμένο σε: επιστροφή τίτλου από legacy MySQL.
   * Το πεδίο BasedOn περιέχει το παλιό Song_ID (string).
   */
  private async fetchLegacyBasedOnTitle(legacyBasedOnId: string): Promise<string | null> {
    const {
      OLD_DB_HOST,
      OLD_DB_PORT,
      OLD_DB_USER,
      OLD_DB_PASSWORD,
      OLD_DB_NAME,
    } = process.env;

    if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
      return null;
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
          SELECT Title
          FROM songs
          WHERE Song_ID = ?
          LIMIT 1
        `,
        [legacyBasedOnId]
      );

      if (!rows || rows.length === 0) return null;

      const title = rows[0].Title;
      if (!title) return null;

      const trimmed = String(title).trim();
      return trimmed !== "" ? trimmed : null;
    } catch (err) {
      console.error("[SongsService] Σφάλμα στο fetchLegacyBasedOnTitle:", legacyBasedOnId, err);
      return null;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Fallback "Βασισμένο σε": από BasedOn (π.χ. "60ec83d8") βρίσκουμε
   * στην ΠΑΛΙΑ MySQL το τραγούδι-πηγή (New_ID -> Song_ID, Title)
   * και μετά στο νέο Postgres το Song με legacySongId = Song_ID.
   */
  private async fetchLegacyBasedOnTarget(
    basedOnCode: string | null,
  ): Promise<{
    basedOnSongId: number | null;
    basedOnSongTitle: string | null;
  }> {
    const {
      OLD_DB_HOST,
      OLD_DB_PORT,
      OLD_DB_USER,
      OLD_DB_PASSWORD,
      OLD_DB_NAME,
    } = process.env;

    if (!basedOnCode || !basedOnCode.trim()) {
      return { basedOnSongId: null, basedOnSongTitle: null };
    }

    if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
      return { basedOnSongId: null, basedOnSongTitle: null };
    }

    const code = basedOnCode.trim();
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

      let legacyBaseId: number | null = null;
      let title: string | null = null;

      // 1) Πρώτα δοκιμάζουμε New_ID = BasedOn (όπως ήταν στο παλιό schema)
      try {
        const [rows] = await connection.query<any[]>(
          `
          SELECT Song_ID, Title
          FROM songs
          WHERE New_ID = ?
          LIMIT 1
        `,
          [code],
        );

        if (rows && rows.length > 0) {
          const row = rows[0] as any;
          legacyBaseId =
            row.Song_ID !== undefined && row.Song_ID !== null
              ? Number(row.Song_ID)
              : null;
          title = row.Title ? String(row.Title).trim() : null;
        }
      } catch (err) {
        console.error(
          "[SongsService] Σφάλμα στο fetchLegacyBasedOnTarget (New_ID)",
          err,
        );
      }

      // 2) Αν δεν βρήκαμε με New_ID, δοκιμάζουμε μήπως το BasedOn είναι ήδη Song_ID
      if (legacyBaseId === null) {
        const numeric = Number(code);
        if (!Number.isNaN(numeric)) {
          try {
            const [rows2] = await connection.query<any[]>(
              `
              SELECT Song_ID, Title
              FROM songs
              WHERE Song_ID = ?
              LIMIT 1
            `,
              [numeric],
            );

            if (rows2 && rows2.length > 0) {
              const row2 = rows2[0] as any;
              legacyBaseId =
                row2.Song_ID !== undefined && row2.Song_ID !== null
                  ? Number(row2.Song_ID)
                  : null;
              title = row2.Title ? String(row2.Title).trim() : null;
            }
          } catch (err) {
            console.error(
              "[SongsService] Σφάλμα στο fetchLegacyBasedOnTarget (Song_ID)",
              err,
            );
          }
        }
      }

      let basedOnSongId: number | null = null;
      let basedOnSongTitle: string | null = title ?? null;

      // ΕΔΩ γίνεται το Prisma query – ΠΑΝΤΑ με number στο legacySongId
      if (legacyBaseId !== null && !Number.isNaN(legacyBaseId)) {
        try {
          const baseSong = await this.prisma.song.findFirst({
            where: { legacySongId: legacyBaseId }, // <== number, ΟΧΙ string
          });

          if (baseSong) {
            basedOnSongId = baseSong.id;
            if (!basedOnSongTitle) {
              basedOnSongTitle = baseSong.title;
            }
          }
        } catch (err) {
          console.error(
            "[SongsService] Σφάλμα Prisma στο fetchLegacyBasedOnTarget",
            err,
          );
        }
      }

      return { basedOnSongId, basedOnSongTitle };
    } catch (err) {
      console.error(
        "[SongsService] Γενικό σφάλμα στο fetchLegacyBasedOnTarget",
        err,
      );
      return { basedOnSongId: null, basedOnSongTitle: null };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }


  /**
   * Βοηθητικό: παίρνει IDs (π.χ. "311" ή "311,488") και επιστρέφει ονόματα από artists.
   */
  private async resolveArtistList(
    connection: mysql.Connection,
    idsValue: string | number | null,
  ): Promise<string | null> {
    if (idsValue === null || idsValue === undefined) {
      return null;
    }

    const raw = String(idsValue).trim();
    if (!raw) {
      return null;
    }

    const idList = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));

    if (idList.length === 0) {
      return null;
    }

    const [rows] = await connection.query<any[]>(
      `
      SELECT Artist_ID, Title, FirstName, LastName
      FROM artists
      WHERE Artist_ID IN (${idList.map(() => "?").join(",")})
    `,
      idList,
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const byId = new Map<number, any>();
    for (const r of rows) {
      byId.set(r.Artist_ID, r);
    }

    const names: string[] = [];
    for (const id of idList) {
      const r = byId.get(id);
      if (!r) continue;
      const fullName =
        `${r.FirstName ?? ""} ${r.LastName ?? ""}`.trim() ||
        (r.Title ? String(r.Title).trim() : "");
      if (fullName) {
        names.push(fullName);
      }
    }

    if (names.length === 0) {
      return null;
    }

    return names.join(", ");
  }

  /**
   * Fallback Δισκογραφία από ΠΑΛΙΑ MySQL (songs_versions + artists).
   */
  private async fetchLegacyVersions(
    legacySongId: number,
  ): Promise<
    {
      id: number;
      year: number | null;
      singerFront: string | null;
      singerBack: string | null;
      solist: string | null;
      youtubeSearch: string | null;
    }[]
  > {
    const {
      OLD_DB_HOST,
      OLD_DB_PORT,
      OLD_DB_USER,
      OLD_DB_PASSWORD,
      OLD_DB_NAME,
    } = process.env;

    if (!OLD_DB_HOST || !OLD_DB_USER || !OLD_DB_NAME) {
      return [];
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
          Version_ID,
          Year,
          Singer_Front,
          Singer_Back,
          Solist,
          Youtube_Search
        FROM songs_versions
        WHERE Song_ID = ?
        ORDER BY Year ASC, Version_ID ASC
      `,
        [legacySongId],
      );

      if (!rows || rows.length === 0) {
        return [];
      }

      const result: {
        id: number;
        year: number | null;
        singerFront: string | null;
        singerBack: string | null;
        solist: string | null;
        youtubeSearch: string | null;
      }[] = [];

      for (const v of rows) {
        const singerFront = await this.resolveArtistList(
          connection,
          v.Singer_Front,
        );
        const singerBack = await this.resolveArtistList(
          connection,
          v.Singer_Back,
        );
        const solist = await this.resolveArtistList(connection, v.Solist);

        result.push({
          id: Number(v.Version_ID),
          year: v.Year !== null ? Number(v.Year) : null,
          singerFront,
          singerBack,
          solist,
          youtubeSearch: v.Youtube_Search
            ? String(v.Youtube_Search).trim()
            : null,
        });
      }

      return result;
    } catch (err) {
      console.error(
        "[SongsService] Σφάλμα στο fetchLegacyVersions για Song_ID",
        legacySongId,
        err,
      );
      return [];
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * Επιστρέφει 1 τραγούδι σε μορφή DTO που ταιριάζει
   * με το SongDetail του Next.
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

    const legacySongId = song.legacySongId ?? song.id;

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

    // 2) Αν δεν βρέθηκαν από το νέο schema, δοκίμασε ΠΑΛΙΑ MySQL
    if (!composerName || !lyricistName) {
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
    // Κατηγορία: νέο schema + fallback παλιά MySQL
    // -----------------------------
    let categoryTitle: string | null = song.category
      ? song.category.title
      : null;

    const legacyCategoryTitle = await this.fetchLegacyCategoryTitle(
      legacySongId,
    );
    if (legacyCategoryTitle) {
      categoryTitle = legacyCategoryTitle;
    }

    // -----------------------------
    // Προβολές (views): νέο schema + fallback παλιά MySQL
    // -----------------------------
    let views: number = song.views ?? 0;
    if (!views || views === 0) {
      const legacyViews = await this.fetchLegacyViews(legacySongId);
      if (legacyViews !== null) {
        views = legacyViews;
      }
    }

    // -----------------------------
    // Βασισμένο σε: από basedOn (string) -> τίτλος + ID για link
    // -----------------------------
    let basedOnSongId: number | null = null;
    let basedOnSongTitle: string | null = null;

    if (song.basedOn && song.basedOn.trim() !== "") {
      const fromLegacy = await this.fetchLegacyBasedOnTarget(
        song.basedOn.trim(),
      );
      basedOnSongId = fromLegacy.basedOnSongId;
      basedOnSongTitle = fromLegacy.basedOnSongTitle;
    }

    // Αν δεν βρούμε τίτλο με κανέναν τρόπο, τουλάχιστον δείχνουμε το raw string
    if (!basedOnSongTitle && song.basedOn && song.basedOn.trim() !== "") {
      basedOnSongTitle = song.basedOn.trim();
    }

    // -----------------------------
    // Δισκογραφία: πρώτα ΠΑΛΙΑ MySQL, αλλιώς νέο schema
    // -----------------------------
    let versions: {
      id: number;
      year: number | null;
      singerFront: string | null;
      singerBack: string | null;
      solist: string | null;
      youtubeSearch: string | null;
    }[] = [];

    const legacyVersions = await this.fetchLegacyVersions(legacySongId);
    if (legacyVersions.length > 0) {
      versions = legacyVersions;
    } else {
      versions = (song.versions ?? []).map((v) => {
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
    }

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

      categoryTitle,
      composerName,
      lyricistName,
      rythmTitle: song.rythm ? song.rythm.title : null,

      basedOnSongId,
      basedOnSongTitle,

      views,
      versions,
    };
  }
}
