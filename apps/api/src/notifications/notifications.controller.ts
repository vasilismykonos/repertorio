import { BadRequestException, Body, Controller, Delete, Get, Headers, Post, Query } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { PushNotificationsService } from "./push-notifications.service";

function requireUserId(value?: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new BadRequestException("Query parameter 'userId' is required.");
  }
  return n;
}

function optionalTake(value?: string): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new BadRequestException("take must be a positive integer");
  }
  return n;
}

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushNotificationsService,
  ) {}

  @Get()
  async list(@Query("userId") userIdStr?: string, @Query("take") takeStr?: string) {
    return this.notifications.listForUser({
      userId: requireUserId(userIdStr),
      take: optionalTake(takeStr),
    });
  }

  @Post("mark-read")
  async markRead(@Query("userId") userIdStr?: string) {
    return this.notifications.markAllRead(requireUserId(userIdStr));
  }

  @Post("contact-admins")
  async contactAdmins(@Query("userId") userIdStr: string | undefined, @Body() body: any) {
    return this.notifications.notifyAdminsContactMessage({
      actorUserId: requireUserId(userIdStr),
      message: body?.message,
    });
  }

  @Get("push/public-key")
  async pushPublicKey() {
    return {
      ok: true,
      enabled: this.push.isEnabled(),
      publicKey: this.push.publicKey(),
    };
  }

  @Post("push/subscribe")
  async pushSubscribe(
    @Query("userId") userIdStr: string | undefined,
    @Body() body: any,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.push.subscribe(requireUserId(userIdStr), body?.subscription || body, userAgent || null);
  }

  @Delete("push/subscribe")
  async pushUnsubscribe(@Query("userId") userIdStr: string | undefined, @Body() body: any) {
    return this.push.unsubscribe(requireUserId(userIdStr), body?.endpoint);
  }
}
