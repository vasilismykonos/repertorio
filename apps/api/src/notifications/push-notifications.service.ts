import { Injectable, Logger } from "@nestjs/common";
import * as webpush from "web-push";
import { PrismaService } from "../prisma/prisma.service";

type PushKeys = {
  p256dh?: string;
  auth?: string;
};

type PushSubscriptionInput = {
  endpoint?: string;
  keys?: PushKeys;
};

type PushPayload = {
  notificationId: number;
  title: string;
  body?: string | null;
  href?: string | null;
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private configured = false;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
    const subject =
      process.env.WEB_PUSH_SUBJECT ||
      process.env.NEXTAUTH_URL ||
      "mailto:repertorio.net@gmail.com";

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    }
  }

  isEnabled() {
    return this.configured && Boolean(process.env.WEB_PUSH_PUBLIC_KEY);
  }

  publicKey() {
    return process.env.WEB_PUSH_PUBLIC_KEY || "";
  }

  async subscribe(userId: number, subscription: PushSubscriptionInput, userAgent?: string | null) {
    const endpoint = String(subscription?.endpoint || "").trim();
    const p256dh = String(subscription?.keys?.p256dh || "").trim();
    const auth = String(subscription?.keys?.auth || "").trim();

    if (!endpoint || !p256dh || !auth) {
      return { ok: false, error: "Invalid push subscription." };
    }

    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent: userAgent || null,
      },
      update: {
        userId,
        p256dh,
        auth,
        userAgent: userAgent || null,
        lastSeenAt: new Date(),
      },
    });

    return { ok: true };
  }

  async unsubscribe(userId: number, endpoint?: string | null) {
    const cleanEndpoint = String(endpoint || "").trim();
    if (!cleanEndpoint) return { ok: true };

    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: cleanEndpoint },
    });

    return { ok: true };
  }

  async sendToUser(userId: number, payload: PushPayload) {
    if (!this.configured) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body || "",
      href: payload.href || "/",
      notificationId: payload.notificationId,
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            body,
          );
        } catch (err: any) {
          const statusCode = Number(err?.statusCode || err?.status);
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => null);
            return;
          }
          this.logger.warn(`Web push failed for subscription ${subscription.id}: ${err?.message || err}`);
        }
      }),
    );
  }
}
