import { Module } from "@nestjs/common";
import { UserHistoryController } from "./user-history.controller";
import { UserHistoryService } from "./user-history.service";

@Module({
  controllers: [UserHistoryController],
  providers: [UserHistoryService],
  exports: [UserHistoryService],
})
export class UserHistoryModule {}
