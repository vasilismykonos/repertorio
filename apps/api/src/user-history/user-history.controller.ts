import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { UserHistoryService } from "./user-history.service";

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

@Controller("user-history")
export class UserHistoryController {
  constructor(private readonly history: UserHistoryService) {}

  @Get()
  async list(@Query("userId") userIdStr?: string, @Query("take") takeStr?: string) {
    return this.history.listForUser({
      userId: requireUserId(userIdStr),
      take: optionalTake(takeStr),
    });
  }

  @Post()
  async batch(@Query("userId") userIdStr: string | undefined, @Body() body: any) {
    return this.history.batchForUser({
      userId: requireUserId(userIdStr),
      events: Array.isArray(body?.events) ? body.events : [],
    });
  }
}
