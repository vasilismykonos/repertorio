// apps/api/src/songs/SongSingerTuneAccess.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SongSingerTuneAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Viewer settings: ποιους creators βλέπω και αν έχω canEdit από αυτούς.
   * Ερμηνεία mode:
   * - rows.length === 0 => "ALL" (default: βλέπω όλους)
   * - αλλιώς => "ONLY_SELECTED"
   */
  async getMyAccess(viewerUserId: number) {
    // Fetch all access rows for this viewer sorted by creator ID.  Each row
    // contains the creator details along with canView/canEdit flags.  We
    // explicitly select only the fields we care about to avoid leaking
    // unrelated information from the Prisma model.
    const rows = await this.prisma.userSingerTuneAccess.findMany({
      where: { viewerUserId },
      orderBy: { creatorUserId: 'asc' },
      select: {
        creatorUserId: true,
        canView: true,
        canEdit: true,
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    // Determine which creators are actively visible for this viewer.  We
    // compute this separately instead of relying on the total number of
    // rows because a viewer may have rows with canView=false (from a
    // previous selection) which should not force the viewer into
    // "ONLY_SELECTED" mode.  If no creator has canView enabled, we treat
    // the viewer as opting into the "ALL" mode.
    const creatorUserIds = rows
      .filter((r) => r.canView)
      .map((r) => r.creatorUserId);

    const mode = creatorUserIds.length > 0 ? 'ONLY_SELECTED' : 'ALL';

    return {
      viewerUserId,
      mode,
      creatorUserIds,
      rows,
    };
  }

  /**
   * Viewer settings update:
   * Ο viewer στέλνει allow-list creators που θέλει να βλέπει.
   *
   * ΣΗΜΑΝΤΙΚΟ: Δεν κάνουμε delete rows όταν αφαιρούνται creators.
   * Βάζουμε canView=false ώστε να μη χαθεί τυχόν canEdit grant.
   */
  async putMyAccess(viewerUserId: number, creatorUserIds: number[]) {
    const clean = Array.from(
      new Set(
        creatorUserIds
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x) && x > 0 && x !== viewerUserId),
      ),
    );

    return this.prisma.$transaction(async (tx) => {
      // Fetch the existing creator IDs for this viewer.  We only need the
      // creatorUserId to determine which rows should be updated.
      const existing = await tx.userSingerTuneAccess.findMany({
        where: { viewerUserId },
        select: { creatorUserId: true },
      });

      const existingSet = new Set(existing.map((e) => e.creatorUserId));
      const desiredSet = new Set(clean);

      // Enable canView for all desired creators.  Upsert will create a
      // new row if one does not exist, preserving any existing canEdit
      // grants.
      for (const creatorUserId of desiredSet) {
        await tx.userSingerTuneAccess.upsert({
          where: {
            UserSingerTuneAccess_unique: { viewerUserId, creatorUserId },
          },
          create: { viewerUserId, creatorUserId, canView: true },
          update: { canView: true },
        });
      }

      // Disable canView for any creators that were previously selected but
      // are no longer desired.  We deliberately avoid deleting the row so
      // that a previously granted canEdit flag is preserved.
      for (const creatorUserId of existingSet) {
        if (!desiredSet.has(creatorUserId)) {
          await tx.userSingerTuneAccess.update({
            where: {
              UserSingerTuneAccess_unique: { viewerUserId, creatorUserId },
            },
            data: { canView: false },
          });
        }
      }

      // Return fresh state for this viewer.  We compute the list of
      // selected creator IDs and the mode consistently with getMyAccess().
      const rows = await tx.userSingerTuneAccess.findMany({
        where: { viewerUserId },
        orderBy: { creatorUserId: 'asc' },
        select: {
          creatorUserId: true,
          canView: true,
          canEdit: true,
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
      });

      const selected = rows
        .filter((r) => r.canView)
        .map((r) => r.creatorUserId);

      const mode = selected.length > 0 ? 'ONLY_SELECTED' : 'ALL';

      return {
        viewerUserId,
        mode,
        creatorUserIds: selected,
        rows,
      };
    });
  }
}
