import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PushNotificationsService } from "../notifications/push-notifications.service";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_PARTICIPANTS = 20;

function cleanMessage(value: unknown): string {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) throw new BadRequestException("Ξ¤ΞΏ ΞΌΞ®Ξ½Ο…ΞΌΞ± ΞµΞ―Ξ½Ξ±ΞΉ ΞΊΞµΞ½Ο.");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestException(`Ξ¤ΞΏ ΞΌΞ®Ξ½Ο…ΞΌΞ± Ο€ΟΞ­Ο€ΞµΞΉ Ξ½Ξ± ΞµΞ―Ξ½Ξ±ΞΉ Ξ­Ο‰Ο‚ ${MAX_MESSAGE_LENGTH} Ο‡Ξ±ΟΞ±ΞΊΟ„Ξ®ΟΞµΟ‚.`);
  }
  return text;
}

function cleanTitle(value: unknown): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 160) : null;
}

function uniquePositiveIds(values: unknown[], include?: number): number[] {
  const ids = new Set<number>();
  if (include && Number.isFinite(include) && include > 0) ids.add(Math.trunc(include));
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) ids.add(Math.trunc(n));
  }
  return Array.from(ids).slice(0, MAX_PARTICIPANTS);
}

function userLabel(user: any): string {
  return user?.displayName || user?.username || user?.email || `User #${user?.id ?? ""}`;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
  ) {}

  private async requireParticipant(threadId: number, userId: number) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { threadId_userId: { threadId, userId } },
    });
    if (!participant) throw new ForbiddenException("Ξ”ΞµΞ½ Ξ­Ο‡ΞµΞΉΟ‚ Ο€ΟΟΟƒΞ²Ξ±ΟƒΞ· ΟƒΟ„Ξ· ΟƒΟ…Ξ½ΞΏΞΌΞΉΞ»Ξ―Ξ±.");
    return participant;
  }

  private async threadDto(threadId: number, viewerUserId: number) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true, username: true, email: true, avatarUrl: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: {
              select: { id: true, displayName: true, username: true, email: true, avatarUrl: true },
            },
          },
        },
      },
    });
    if (!thread) throw new NotFoundException("Ξ— ΟƒΟ…Ξ½ΞΏΞΌΞΉΞ»Ξ―Ξ± Ξ΄ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞµ.");

    const viewer = thread.participants.find((p) => p.userId === viewerUserId);
    if (!viewer) throw new ForbiddenException("Ξ”ΞµΞ½ Ξ­Ο‡ΞµΞΉΟ‚ Ο€ΟΟΟƒΞ²Ξ±ΟƒΞ· ΟƒΟ„Ξ· ΟƒΟ…Ξ½ΞΏΞΌΞΉΞ»Ξ―Ξ±.");

    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        threadId,
        deletedAt: null,
        senderUserId: { not: viewerUserId },
        ...(viewer.lastReadAt ? { createdAt: { gt: viewer.lastReadAt } } : {}),
      },
    });

    const otherUsers = thread.participants.filter((p) => p.userId !== viewerUserId).map((p) => p.user);
    const title =
      thread.title ||
      (otherUsers.length ? otherUsers.map(userLabel).join(", ") : "Ξ ΟΞΏΟƒΟ‰Ο€ΞΉΞΊΞ® ΟƒΟ…Ξ½ΞΏΞΌΞΉΞ»Ξ―Ξ±");

    return {
      id: thread.id,
      title,
      isGroup: thread.isGroup,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      lastMessageAt: thread.lastMessageAt,
      unreadCount,
      participants: thread.participants.map((p) => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        lastReadAt: p.lastReadAt,
        user: p.user,
      })),
      lastMessage: thread.messages[0]
        ? {
            id: thread.messages[0].id,
            body: thread.messages[0].body,
            createdAt: thread.messages[0].createdAt,
            sender: thread.messages[0].sender,
          }
        : null,
    };
  }

  async listThreads(viewerUserId: number) {
    const rows = await this.prisma.chatParticipant.findMany({
      where: { userId: viewerUserId },
      orderBy: [{ thread: { lastMessageAt: "desc" } }, { joinedAt: "desc" }],
      select: { threadId: true },
      take: 80,
    });

    const threads = await Promise.all(rows.map((row) => this.threadDto(row.threadId, viewerUserId)));
    return { ok: true, threads };
  }

  async startThread(viewerUserId: number, body: any) {
    const participantIds = uniquePositiveIds(Array.isArray(body?.participantUserIds) ? body.participantUserIds : [], viewerUserId);
    if (participantIds.length < 2) throw new BadRequestException("Ξ•Ο€Ξ―Ξ»ΞµΞΎΞµ Ο„ΞΏΟ…Ξ»Ξ¬Ο‡ΞΉΟƒΟ„ΞΏΞ½ Ξ­Ξ½Ξ±Ξ½ Ο€Ξ±ΟΞ±Ξ»Ξ®Ο€Ο„Ξ·.");

    const usersCount = await this.prisma.user.count({ where: { id: { in: participantIds } } });
    if (usersCount !== participantIds.length) throw new BadRequestException("ΞΞ¬Ο€ΞΏΞΉΞΏΟ‚ Ο‡ΟΞ®ΟƒΟ„Ξ·Ο‚ Ξ΄ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞµ.");

    const isGroup = Boolean(body?.isGroup) || participantIds.length > 2;
    const title = isGroup ? cleanTitle(body?.title) : null;

    if (!isGroup && participantIds.length === 2) {
      const otherUserId = participantIds.find((id) => id !== viewerUserId)!;
      const existing = await this.prisma.chatThread.findFirst({
        where: {
          isGroup: false,
          participants: {
            every: { userId: { in: [viewerUserId, otherUserId] } },
          },
        },
        include: { participants: { select: { userId: true } } },
      });
      if (existing && existing.participants.length === 2) {
        return { ok: true, thread: await this.threadDto(existing.id, viewerUserId) };
      }
    }

    const thread = await this.prisma.chatThread.create({
      data: {
        isGroup,
        title,
        createdByUserId: viewerUserId,
        participants: {
          create: participantIds.map((userId) => ({
            userId,
            lastReadAt: userId === viewerUserId ? new Date() : null,
          })),
        },
      },
      select: { id: true },
    });

    return { ok: true, thread: await this.threadDto(thread.id, viewerUserId) };
  }

  async listMessages(viewerUserId: number, threadId: number, afterId?: number | null) {
    await this.requireParticipant(threadId, viewerUserId);
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        threadId,
        deletedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: afterId ? 100 : 80,
      include: {
        sender: {
          select: { id: true, displayName: true, username: true, email: true, avatarUrl: true },
        },
      },
    });

    return {
      ok: true,
      messages: messages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        body: message.body,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        sender: message.sender,
        mine: message.senderUserId === viewerUserId,
      })),
    };
  }

  async sendMessage(viewerUserId: number, threadId: number, body: any) {
    await this.requireParticipant(threadId, viewerUserId);
    const text = cleanMessage(body?.body);
    const now = new Date();

    const message = await this.prisma.chatMessage.create({
      data: { threadId, senderUserId: viewerUserId, body: text },
      include: {
        sender: {
          select: { id: true, displayName: true, username: true, email: true, avatarUrl: true },
        },
      },
    });

    await this.prisma.$transaction([
      this.prisma.chatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: now },
      }),
      this.prisma.chatParticipant.update({
        where: { threadId_userId: { threadId, userId: viewerUserId } },
        data: { lastReadAt: now },
      }),
    ]);

    void this.pushOfflineRecipients(threadId, viewerUserId, message.id, text).catch(() => null);

    return {
      ok: true,
      message: {
        id: message.id,
        threadId: message.threadId,
        body: message.body,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        sender: message.sender,
        mine: true,
      },
      thread: await this.threadDto(threadId, viewerUserId),
    };
  }

  async markRead(viewerUserId: number, threadId: number) {
    await this.requireParticipant(threadId, viewerUserId);
    await this.prisma.chatParticipant.update({
      where: { threadId_userId: { threadId, userId: viewerUserId } },
      data: { lastReadAt: new Date() },
    });
    return { ok: true, thread: await this.threadDto(threadId, viewerUserId) };
  }

  private async pushOfflineRecipients(threadId: number, senderUserId: number, messageId: number, text: string) {
    const [thread, sender] = await Promise.all([
      this.prisma.chatThread.findUnique({
        where: { id: threadId },
        include: { participants: true },
      }),
      this.prisma.user.findUnique({
        where: { id: senderUserId },
        select: { id: true, displayName: true, username: true, email: true },
      }),
    ]);

    if (!thread || !sender) return;

    const recipients = thread.participants.filter((p) => p.userId !== senderUserId && !p.mutedAt);
    if (!recipients.length) return;

    const senderName = userLabel(sender);
    const preview = text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
    const title = thread.title ? `Νέο μήνυμα: ${thread.title}` : `Νέο μήνυμα από ${senderName}`;
    const body = `${senderName}: ${preview}`;
    const href = `/?chatThreadId=${threadId}`;

    await Promise.all(
      recipients.map((participant) =>
        this.push
          .sendToUser(participant.userId, {
            notificationId: messageId,
            title,
            body,
            href,
          })
          .catch(() => null),
      ),
    );
  }
}
