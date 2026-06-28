import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { ChatService } from "./chat.service";

function requireUserId(value?: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new BadRequestException("Query parameter 'userId' is required.");
  }
  return n;
}

@Controller("chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("threads")
  async listThreads(@Query("userId") userId?: string) {
    return this.chat.listThreads(requireUserId(userId));
  }

  @Post("threads")
  async startThread(@Query("userId") userId: string | undefined, @Body() body: any) {
    return this.chat.startThread(requireUserId(userId), body);
  }

  @Get("threads/:threadId/messages")
  async listMessages(
    @Query("userId") userId: string | undefined,
    @Param("threadId", ParseIntPipe) threadId: number,
    @Query("afterId") afterId?: string,
  ) {
    const after = afterId ? Number(afterId) : null;
    if (afterId && (!Number.isFinite(after) || (after as number) <= 0)) {
      throw new BadRequestException("Invalid afterId.");
    }
    return this.chat.listMessages(requireUserId(userId), threadId, after);
  }

  @Post("threads/:threadId/messages")
  async sendMessage(
    @Query("userId") userId: string | undefined,
    @Param("threadId", ParseIntPipe) threadId: number,
    @Body() body: any,
  ) {
    return this.chat.sendMessage(requireUserId(userId), threadId, body);
  }

  @Post("threads/:threadId/read")
  async markRead(@Query("userId") userId: string | undefined, @Param("threadId", ParseIntPipe) threadId: number) {
    return this.chat.markRead(requireUserId(userId), threadId);
  }
}
