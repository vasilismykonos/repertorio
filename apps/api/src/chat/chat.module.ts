import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [PrismaService, ChatService],
})
export class ChatModule {}
