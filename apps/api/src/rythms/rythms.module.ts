// src/rythms/rythms.module.ts
import { Module } from '@nestjs/common';
import { RythmsService } from './rythms.service';
import { RythmsController } from './rythms.controller';

@Module({
  controllers: [RythmsController],
  providers: [RythmsService],
})
export class RythmsModule {}

