import { BadRequestException, Controller, Get, Post, Query } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

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
  constructor(private readonly notifications: NotificationsService) {}

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
}
