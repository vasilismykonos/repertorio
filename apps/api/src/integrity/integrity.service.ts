import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type CheckStatus = "ok" | "warning" | "critical";

type IntegrityCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  count?: number;
  message: string;
  solution?: string;
  fixAction?: string;
  fixLabel?: string;
  details?: string[];
};

type TotalRow = { key: string; count: number | bigint };
type CountRow = { count: number | bigint };

@Injectable()
export class IntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const startedAt = Date.now();

    const [totals, checks] = await Promise.all([
      this.readTotals(),
      this.runChecks(),
    ]);

    const status = this.overallStatus(checks);
    const score = this.score(checks);

    return {
      ok: status !== "critical",
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      status,
      score,
      totals,
      checks,
    };
  }

  async repair(action: string) {
    const startedAt = Date.now();
    let affected = 0;
    let message = "Δεν εκτελέστηκε καμία ενέργεια.";

    if (action === "delete-orphan-tune-mentions") {
      const result = await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM "SongSingerTuneMention" m
        WHERE NOT EXISTS (
          SELECT 1 FROM "SongSingerTune" st WHERE st."id" = m."songSingerTuneId"
        )
      `);
      affected = Number(result || 0);
      message = "Διαγράφηκαν άκυρες αναφορές τονικοτήτων που έδειχναν σε ανύπαρκτη τονικότητα.";
    } else if (action === "delete-orphan-user-tune-mentions") {
      const result = await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM "SongSingerTuneMention" m
        WHERE NOT EXISTS (
          SELECT 1 FROM "User" u WHERE u."id" = m."userId"
        )
      `);
      affected = Number(result || 0);
      message = "Διαγράφηκαν άκυρες αναφορές τονικοτήτων που έδειχναν σε ανύπαρκτο χρήστη.";
    } else if (action === "delete-broken-push-subscriptions") {
      const result = await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PushSubscription"
        WHERE btrim(COALESCE("endpoint", '')) = ''
          OR btrim(COALESCE("p256dh", '')) = ''
          OR btrim(COALESCE("auth", '')) = ''
      `);
      affected = Number(result || 0);
      message = "Διαγράφηκαν ελλιπείς εγγραφές push.";
    } else {
      throw new Error("Unsupported repair action");
    }

    return {
      ok: true,
      action,
      affected,
      message,
      durationMs: Date.now() - startedAt,
    };
  }

  private async readTotals() {
    const rows = await this.prisma.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT 'users' AS key, COUNT(*)::int AS count FROM "User"
      UNION ALL SELECT 'songs', COUNT(*)::int FROM "Song"
      UNION ALL SELECT 'publishedSongs', COUNT(*)::int FROM "Song" WHERE "status" = 'PUBLISHED'
      UNION ALL SELECT 'pendingSongs', COUNT(*)::int FROM "Song" WHERE "status" = 'PENDING_APPROVAL'
      UNION ALL SELECT 'lists', COUNT(*)::int FROM "List"
      UNION ALL SELECT 'listItems', COUNT(*)::int FROM "ListItem"
      UNION ALL SELECT 'assets', COUNT(*)::int FROM "Asset"
      UNION ALL SELECT 'notifications', COUNT(*)::int FROM "Notification"
      UNION ALL SELECT 'pushSubscriptions', COUNT(*)::int FROM "PushSubscription"
      UNION ALL SELECT 'chatThreads', COUNT(*)::int FROM "ChatThread"
      UNION ALL SELECT 'chatMessages', COUNT(*)::int FROM "ChatMessage"
    `);

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.key] = Number(row.count || 0);
      return acc;
    }, {});
  }

  private async runChecks(): Promise<IntegrityCheck[]> {
    const [
      db,
      songsMissingTitle,
      songsMissingSlug,
      listItemsWithoutContent,
      listItemsTuneMismatch,
      listItemsToneWithoutSign,
      tuneMentionsWithoutTune,
      tuneMentionsWithoutUser,
      assetsWithoutSource,
      pushSubscriptionsBroken,
      chatMessagesWithoutParticipant,
      duplicateDirectThreads,
    ] = await Promise.all([
      this.safeCount(Prisma.sql`SELECT 1::int AS count`),
      this.safeCount(Prisma.sql`SELECT COUNT(*)::int AS count FROM "Song" WHERE btrim(COALESCE("title", '')) = ''`),
      this.safeCount(Prisma.sql`SELECT COUNT(*)::int AS count FROM "Song" WHERE btrim(COALESCE("slug", '')) = ''`),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "ListItem"
        WHERE "songId" IS NULL
          AND btrim(COALESCE("title", '')) = ''
          AND btrim(COALESCE("lyrics", '')) = ''
          AND btrim(COALESCE("chords", '')) = ''
      `),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "ListItem" li
        JOIN "SongSingerTune" st ON st."id" = li."selectedSingerTuneId"
        WHERE li."songId" IS NOT NULL
          AND st."songId" <> li."songId"
      `),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "ListItem"
        WHERE btrim(COALESCE("selectedTonicity", '')) <> ''
          AND btrim(COALESCE("selectedTonicitySign", '')) = ''
      `),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "SongSingerTuneMention" m
        LEFT JOIN "SongSingerTune" st ON st."id" = m."songSingerTuneId"
        WHERE st."id" IS NULL
      `),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "SongSingerTuneMention" m
        LEFT JOIN "User" u ON u."id" = m."userId"
        WHERE u."id" IS NULL
      `),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "Asset"
        WHERE btrim(COALESCE("url", '')) = ''
          AND btrim(COALESCE("filePath", '')) = ''
      `),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "PushSubscription"
        WHERE btrim(COALESCE("endpoint", '')) = ''
          OR btrim(COALESCE("p256dh", '')) = ''
          OR btrim(COALESCE("auth", '')) = ''
      `),
      this.safeCount(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "ChatMessage" cm
        LEFT JOIN "ChatParticipant" cp
          ON cp."threadId" = cm."threadId"
         AND cp."userId" = cm."senderUserId"
        WHERE cp."userId" IS NULL
      `),
      this.safeCount(Prisma.sql`
        WITH pairs AS (
          SELECT
            cp."threadId",
            string_agg(cp."userId"::text, ',' ORDER BY cp."userId") AS pair_key,
            COUNT(*) AS participant_count
          FROM "ChatParticipant" cp
          JOIN "ChatThread" ct ON ct."id" = cp."threadId"
          WHERE ct."isGroup" = false
          GROUP BY cp."threadId"
        )
        SELECT COALESCE(SUM(duplicates - 1), 0)::int AS count
        FROM (
          SELECT pair_key, COUNT(*)::int AS duplicates
          FROM pairs
          WHERE participant_count = 2
          GROUP BY pair_key
          HAVING COUNT(*) > 1
        ) d
      `),
    ]);

    const details = await this.readProblemDetails({
      songsMissingTitle,
      songsMissingSlug,
      listItemsWithoutContent,
      listItemsTuneMismatch,
      listItemsToneWithoutSign,
      tuneMentionsWithoutTune,
      tuneMentionsWithoutUser,
      assetsWithoutSource,
      pushSubscriptionsBroken,
      chatMessagesWithoutParticipant,
      duplicateDirectThreads,
    });

    return [
      {
        id: "database",
        label: "Σύνδεση βάσης",
        status: db === 1 ? "ok" : "critical",
        message: db === 1 ? "Η βάση απαντά κανονικά." : "Δεν επιβεβαιώθηκε η σύνδεση με τη βάση.",
        solution: db === 1 ? undefined : "Έλεγξε το DATABASE_URL, την PostgreSQL υπηρεσία και τα API logs.",
      },
      this.zeroOk("songs-title", "Τραγούδια χωρίς τίτλο", songsMissingTitle, "Όλα τα τραγούδια έχουν τίτλο.", "Υπάρχουν τραγούδια χωρίς τίτλο.", "warning", details.songsMissingTitle, "Άνοιξε το αντίστοιχο τραγούδι στην επεξεργασία και συμπλήρωσε τίτλο."),
      this.zeroOk("songs-slug", "Τραγούδια χωρίς slug", songsMissingSlug, "Όλα τα τραγούδια έχουν slug.", "Υπάρχουν τραγούδια χωρίς slug.", "warning", details.songsMissingSlug, "Άνοιξε το τραγούδι στην επεξεργασία και αποθήκευσέ το ώστε να δημιουργηθεί slug ή συμπλήρωσέ το από admin εργαλείο."),
      this.zeroOk("list-items-content", "Άδεια στοιχεία λίστας", listItemsWithoutContent, "Δεν βρέθηκαν άδεια στοιχεία λίστας.", "Υπάρχουν στοιχεία λίστας χωρίς τραγούδι, τίτλο, στίχους ή συγχορδίες.", "warning", details.listItemsWithoutContent, "Άνοιξε την αντίστοιχη λίστα και είτε συμπλήρωσε το στοιχείο είτε διέγραψέ το."),
      this.zeroOk("list-items-singer-tune", "Τονικότητα λίστας σε λάθος τραγούδι", listItemsTuneMismatch, "Οι επιλεγμένες τονικότητες λιστών αντιστοιχούν στα σωστά τραγούδια.", "Υπάρχουν στοιχεία λίστας που δείχνουν σε τονικότητα άλλου τραγουδιού.", "critical", details.listItemsTuneMismatch, "Άνοιξε την επεξεργασία της λίστας και επίλεξε ξανά σωστή τονικότητα/φωνή για το συγκεκριμένο τραγούδι."),
      this.zeroOk("list-items-tone-sign", "Τόνος λίστας χωρίς πρόσημο", listItemsToneWithoutSign, "Όσα στοιχεία λίστας έχουν τόνο έχουν και πρόσημο.", "Υπάρχουν στοιχεία λίστας με τόνο αλλά χωρίς πρόσημο.", "warning", details.listItemsToneWithoutSign, "Άνοιξε την επεξεργασία της λίστας και διάλεξε πρόσημο ή αφαίρεσε τον τόνο."),
      this.zeroOk("tune-mentions-tune", "Αναφορές τονικοτήτων χωρίς τονικότητα", tuneMentionsWithoutTune, "Οι αναφορές τονικοτήτων δείχνουν σε υπαρκτές τονικότητες.", "Υπάρχουν αναφορές τονικοτήτων που δείχνουν σε ανύπαρκτη τονικότητα.", "critical", details.tuneMentionsWithoutTune, "Αυτές οι εγγραφές δεν μπορούν να προβληθούν σε σελίδα γιατί η τονικότητα έχει χαθεί. Η ασφαλής λύση είναι να διαγραφούν οι άκυρες αναφορές.", "delete-orphan-tune-mentions", "Διαγραφή άκυρων αναφορών"),
      this.zeroOk("tune-mentions-user", "Αναφορές τονικοτήτων χωρίς χρήστη", tuneMentionsWithoutUser, "Οι αναφορές τονικοτήτων δείχνουν σε υπαρκτούς χρήστες.", "Υπάρχουν αναφορές τονικοτήτων που δείχνουν σε ανύπαρκτο χρήστη.", "critical", details.tuneMentionsWithoutUser, "Αν ο χρήστης έχει διαγραφεί, η ασφαλής λύση είναι να διαγραφούν οι άκυρες αναφορές.", "delete-orphan-user-tune-mentions", "Διαγραφή άκυρων αναφορών"),
      this.zeroOk("assets-source", "Assets χωρίς αρχείο ή URL", assetsWithoutSource, "Όλα τα υλικά έχουν αρχείο ή URL.", "Υπάρχουν υλικά χωρίς αρχείο και χωρίς URL.", "warning", details.assetsWithoutSource, "Άνοιξε το υλικό από τη διαχείριση assets και πρόσθεσε αρχείο/URL ή διέγραψέ το αν δημιουργήθηκε κατά λάθος."),
      this.zeroOk("push-subscriptions", "Εγγραφές push με ελλιπή κλειδιά", pushSubscriptionsBroken, "Οι εγγραφές push έχουν τα απαραίτητα κλειδιά.", "Υπάρχουν push subscriptions με ελλιπή δεδομένα.", "warning", details.pushSubscriptionsBroken, "Οι ελλιπείς εγγραφές push δεν μπορούν να χρησιμοποιηθούν. Μπορούν να διαγραφούν με ασφάλεια.", "delete-broken-push-subscriptions", "Διαγραφή ελλιπών push"),
      this.zeroOk("chat-participants", "Μηνύματα chat από μη συμμετέχοντες", chatMessagesWithoutParticipant, "Τα μηνύματα chat ανήκουν σε συμμετέχοντες των συνομιλιών.", "Υπάρχουν μηνύματα chat από χρήστες που δεν είναι participants στο thread.", "critical", details.chatMessagesWithoutParticipant, "Χρειάζεται έλεγχος του thread: είτε προσθήκη του αποστολέα στους participants είτε διαγραφή/αρχειοθέτηση του προβληματικού μηνύματος."),
      this.zeroOk("chat-duplicate-direct", "Διπλές άμεσες συνομιλίες", duplicateDirectThreads, "Δεν βρέθηκαν διπλές άμεσες συνομιλίες για το ίδιο ζευγάρι χρηστών.", "Υπάρχουν διπλές άμεσες συνομιλίες για το ίδιο ζευγάρι χρηστών.", "warning", details.duplicateDirectThreads, "Χρειάζεται συγχώνευση συνομιλιών ή επιλογή της πιο πρόσφατης ως κύριας. Δεν γίνεται αυτόματη διόρθωση για να μη χαθούν μηνύματα."),
    ];
  }

  private async readProblemDetails(counts: Record<string, number>): Promise<Record<string, string[]>> {
    const entries = await Promise.all(
      Object.entries(counts).map(async ([key, count]) => {
        if (count <= 0) return [key, []] as const;
        return [key, await this.detailRows(key)] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  private async detailRows(key: string): Promise<string[]> {
    try {
      switch (key) {
        case "tuneMentionsWithoutTune":
          return this.rowsToDetails(await this.prisma.$queryRaw<Array<{ id: number; songSingerTuneId: number; userId: number }>>(Prisma.sql`
            SELECT m."id", m."songSingerTuneId", m."userId"
            FROM "SongSingerTuneMention" m
            LEFT JOIN "SongSingerTune" st ON st."id" = m."songSingerTuneId"
            WHERE st."id" IS NULL
            ORDER BY m."id"
            LIMIT 5
          `));
        case "tuneMentionsWithoutUser":
          return this.rowsToDetails(await this.prisma.$queryRaw<Array<{ id: number; songSingerTuneId: number; userId: number }>>(Prisma.sql`
            SELECT m."id", m."songSingerTuneId", m."userId"
            FROM "SongSingerTuneMention" m
            LEFT JOIN "User" u ON u."id" = m."userId"
            WHERE u."id" IS NULL
            ORDER BY m."id"
            LIMIT 5
          `));
        case "listItemsTuneMismatch":
          return this.rowsToDetails(await this.prisma.$queryRaw<Array<{ id: number; listId: number; songId: number | null; selectedSingerTuneId: number | null }>>(Prisma.sql`
            SELECT li."id", li."listId", li."songId", li."selectedSingerTuneId"
            FROM "ListItem" li
            JOIN "SongSingerTune" st ON st."id" = li."selectedSingerTuneId"
            WHERE li."songId" IS NOT NULL
              AND st."songId" <> li."songId"
            ORDER BY li."id"
            LIMIT 5
          `));
        case "listItemsToneWithoutSign":
          return this.rowsToDetails(await this.prisma.$queryRaw<Array<{ id: number; listId: number; selectedTonicity: string }>>(Prisma.sql`
            SELECT "id", "listId", "selectedTonicity"
            FROM "ListItem"
            WHERE btrim(COALESCE("selectedTonicity", '')) <> ''
              AND btrim(COALESCE("selectedTonicitySign", '')) = ''
            ORDER BY "id"
            LIMIT 5
          `));
        case "assetsWithoutSource":
          return this.rowsToDetails(await this.prisma.$queryRaw<Array<{ id: number; kind: string; type: string; title: string | null }>>(Prisma.sql`
            SELECT "id", "kind", "type", "title"
            FROM "Asset"
            WHERE btrim(COALESCE("url", '')) = ''
              AND btrim(COALESCE("filePath", '')) = ''
            ORDER BY "id"
            LIMIT 5
          `));
        case "chatMessagesWithoutParticipant":
          return this.rowsToDetails(await this.prisma.$queryRaw<Array<{ id: number; threadId: number; senderUserId: number }>>(Prisma.sql`
            SELECT cm."id", cm."threadId", cm."senderUserId"
            FROM "ChatMessage" cm
            LEFT JOIN "ChatParticipant" cp
              ON cp."threadId" = cm."threadId"
             AND cp."userId" = cm."senderUserId"
            WHERE cp."userId" IS NULL
            ORDER BY cm."id"
            LIMIT 5
          `));
        default:
          return [];
      }
    } catch {
      return [];
    }
  }

  private rowsToDetails(rows: Array<Record<string, unknown>>): string[] {
    return rows.map((row) =>
      Object.entries(row)
        .map(([key, value]) => `${key}: ${value ?? "-"}`)
        .join(", "),
    );
  }

  private async safeCount(query: Prisma.Sql): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<CountRow[]>(query);
      return Number(rows?.[0]?.count || 0);
    } catch {
      return -1;
    }
  }

  private zeroOk(
    id: string,
    label: string,
    count: number,
    okMessage: string,
    badMessage: string,
    badStatus: CheckStatus = "warning",
    details?: string[],
    solution?: string,
    fixAction?: string,
    fixLabel?: string,
  ): IntegrityCheck {
    if (count < 0) {
      return {
        id,
        label,
        status: "critical",
        message: "Ο έλεγχος απέτυχε να εκτελεστεί.",
      };
    }
    return {
      id,
      label,
      status: count === 0 ? "ok" : badStatus,
      count,
      message: count === 0 ? okMessage : badMessage,
      solution: count === 0 ? undefined : solution,
      fixAction: count === 0 ? undefined : fixAction,
      fixLabel: count === 0 ? undefined : fixLabel,
      details: count === 0 ? undefined : details,
    };
  }

  private overallStatus(checks: IntegrityCheck[]): CheckStatus {
    if (checks.some((check) => check.status === "critical")) return "critical";
    if (checks.some((check) => check.status === "warning")) return "warning";
    return "ok";
  }

  private score(checks: IntegrityCheck[]): number {
    const penalty = checks.reduce((sum, check) => {
      if (check.status === "critical") return sum + 25;
      if (check.status === "warning") return sum + 8;
      return sum;
    }, 0);
    return Math.max(0, 100 - penalty);
  }
}
