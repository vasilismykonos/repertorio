import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { RythmsService } from "./rythms.service";

@Controller("rythms")
export class RythmsController {
  constructor(private readonly rythmsService: RythmsService) {}

  @Get()
  async getAllRythms() {
    return this.rythmsService.findAll();
  }

  @Post()
  async createRythm(@Body() body: any) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid request body");
    }
    const title = String(body.title ?? "").trim();
    return this.rythmsService.create({ title });
  }
}
