import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { PresenceService } from "./presence.service";

function assertInternalKey(value?: string) {
  const expected = String(process.env.INTERNAL_API_KEY ?? "").trim();
  if (!expected) {
    throw new InternalServerErrorException("Server misconfigured");
  }
  if (String(value ?? "").trim() !== expected) {
    throw new UnauthorizedException("Unauthorized");
  }
}

@Controller("presence")
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get("online-count")
  async onlineCount(@Query("windowSec") windowSec?: string) {
    const n = windowSec ? Number(windowSec) : 300;
    return this.presence.onlineCount(n);
  }

  @Get("online-users")
  async onlineUsers(
    @Query("windowSec") windowSec?: string,
    @Query("take") take?: string,
  ) {
    return this.presence.onlineUsers({
      windowSec: windowSec ? Number(windowSec) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get("admin-stats")
  async adminStats(@Headers("x-internal-key") internalKey?: string) {
    assertInternalKey(internalKey);
    return this.presence.adminStats();
  }

  @Post("ping")
  async ping(@Query("userId") userId?: string) {
    const id = Number(userId);
    if (!id) throw new BadRequestException("Missing userId");
    return this.presence.ping(id);
  }
}
