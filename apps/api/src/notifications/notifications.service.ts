import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PushNotificationsService } from "./push-notifications.service";

const DEFAULT_TAKE = 10;
const MAX_TAKE = 30;
const MAX_CONTACT_MESSAGE_LENGTH = 2000;
const VISIBLE_NOTIFICATION_WHERE = { type: { not: "CHAT_MESSAGE" } } as const;

export type NotificationDto = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
  actor: {
    id: number;
    displayName: string | null;
    username: string | null;
    email: string | null;
    avatarUrl: string | null;
  } | null;
};

function normalizeTake(value?: number): number {
  if (!value) return DEFAULT_TAKE;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException("take must be a positive integer");
  }
  return Math.min(value, MAX_TAKE);
}

function cleanContactMessage(value: unknown): string {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (text.length < 3) {
    throw new BadRequestException("message is required");
  }
  if (text.length > MAX_CONTACT_MESSAGE_LENGTH) {
    throw new BadRequestException(`message must be at most ${MAX_CONTACT_MESSAGE_LENGTH} characters`);
  }
  return text;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
  ) {}

  private toDto(row: any): NotificationDto {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body ?? null,
      data: row.data ?? null,
      readAt: row.readAt ?? null,
      createdAt: row.createdAt,
      actor: row.actor
        ? {
            id: row.actor.id,
            displayName: row.actor.displayName ?? null,
            username: row.actor.username ?? null,
            email: row.actor.email ?? null,
            avatarUrl: row.actor.avatarUrl ?? null,
          }
        : null,
    };
  }

  async listForUser(params: { userId: number; take?: number }) {
    const take = normalizeTake(params.take);

    const [unreadCount, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({
        where: { recipientUserId: params.userId, readAt: null, ...VISIBLE_NOTIFICATION_WHERE },
      }),
      this.prisma.notification.findMany({
        where: { recipientUserId: params.userId, ...VISIBLE_NOTIFICATION_WHERE },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          actor: {
            select: {
              id: true,
              displayName: true,
              username: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);

    return {
      ok: true,
      unreadCount,
      items: rows.map((row) => this.toDto(row)),
    };
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null, ...VISIBLE_NOTIFICATION_WHERE },
      data: { readAt: new Date() },
    });

    return this.listForUser({ userId });
  }

  async notifyListMemberAdded(params: {
    recipientUserId: number;
    actorUserId: number;
    listId: number;
    listTitle: string;
    role: string;
  }) {
    const { recipientUserId, actorUserId, listId, listTitle, role } = params;

    if (recipientUserId === actorUserId) return null;

    const notification = await this.prisma.notification.create({
      data: {
        recipientUserId,
        actorUserId,
        type: "LIST_MEMBER_ADDED",
        title: "Προστέθηκες σε λίστα",
        body: `Έχεις πλέον πρόσβαση στη λίστα «${listTitle}».`,
        data: {
          listId,
          listTitle,
          role,
          href: `/lists/${listId}`,
        },
      },
    });

    void this.push.sendToUser(recipientUserId, {
      notificationId: notification.id,
      title: notification.title,
      body: notification.body,
      href: `/lists/${listId}`,
    }).catch(() => null);

    return notification;
  }

  async notifyAdminsContactMessage(params: { actorUserId: number; message: unknown }) {
    const message = cleanContactMessage(params.message);

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorUserId },
      select: {
        id: true,
        displayName: true,
        username: true,
        email: true,
      },
    });

    if (!actor) {
      throw new BadRequestException("sender not found");
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: "ADMIN",
      },
      select: { id: true },
    });

    const senderLabel = actor.displayName || actor.username || actor.email || `User #${actor.id}`;
    const preview = message.length > 180 ? `${message.slice(0, 177).trimEnd()}...` : message;
    const notifications = await Promise.all(
      admins.map((admin) =>
        this.prisma.notification.create({
          data: {
            recipientUserId: admin.id,
            actorUserId: actor.id,
            type: "CONTACT_MESSAGE",
            title: "Νέο μήνυμα επικοινωνίας",
            body: `${senderLabel}: ${preview}`,
            data: {
              senderUserId: actor.id,
              senderName: senderLabel,
              senderEmail: actor.email,
              message,
              href: "/settings",
            },
          },
        }),
      ),
    );

    await Promise.all(
      notifications.map((notification) =>
        this.push
          .sendToUser(notification.recipientUserId, {
            notificationId: notification.id,
            title: notification.title,
            body: notification.body,
            href: "/settings",
          })
          .catch(() => null),
      ),
    );

    return {
      ok: true,
      notifiedAdmins: notifications.length,
    };
  }
}
