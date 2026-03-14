import { BadRequestException, Controller, Get, Post, Query } from "@nestjs/common";
import { PresenceService } from "./presence.service";

@Controller("presence")
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get("online-count")
  async onlineCount(@Query("windowSec") windowSec?: string) {
    const n = windowSec ? Number(windowSec) : 300;
    return this.presence.onlineCount(n);
  }

  @Post("ping")
  async ping(@Query("userId") userId?: string) {
    const id = Number(userId);
    if (!id) throw new BadRequestException("Missing userId");
    return this.presence.ping(id);
  }
}