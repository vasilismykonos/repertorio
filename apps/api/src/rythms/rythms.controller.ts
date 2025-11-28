// src/rythms/rythms.controller.ts
import { Controller, Get } from '@nestjs/common';
import { RythmsService } from './rythms.service';

@Controller('rythms')
export class RythmsController {
  constructor(private readonly rythmsService: RythmsService) {}

  @Get()
  async getAllRythms() {
    return this.rythmsService.findAll();
  }
}

