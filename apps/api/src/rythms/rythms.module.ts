import { Module } from "@nestjs/common";
import { RythmsService } from "./rythms.service";
import { RythmsController } from "./rythms.controller";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [RythmsController],
  providers: [RythmsService, PrismaService],
})
export class RythmsModule {}
