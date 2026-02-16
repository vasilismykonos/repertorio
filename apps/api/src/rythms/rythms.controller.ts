import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  Patch,
  Delete,
} from '@nestjs/common';
import { RythmsService } from './rythms.service';

@Controller('rythms')
export class RythmsController {
  constructor(private readonly rythmsService: RythmsService) {}

  @Get()
  async getAllRythms(
    @Query('q') q?: string,
    @Query('skip') skipStr?: string,
    @Query('take') takeStr?: string,
  ) {
    const skip = skipStr ? Number.parseInt(skipStr, 10) : undefined;
    const take = takeStr ? Number.parseInt(takeStr, 10) : undefined;
    return this.rythmsService.findAll({ q: q ?? undefined, skip, take });
  }

  @Get(':id')
  async getRythm(@Param('id', ParseIntPipe) id: number) {
    return this.rythmsService.findById(id);
  }

  @Post()
  async createRythm(@Body() body: any) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid request body');
    }
    const title = String(body.title ?? '').trim();
    const slug = body.slug != null ? String(body.slug).trim() : undefined;
    return this.rythmsService.create({ title, slug });
  }

  @Patch(':id')
  async updateRythm(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid request body');
    }
    const title =
      body.title !== undefined && body.title !== null
        ? String(body.title).trim()
        : undefined;
    const slug =
      body.slug !== undefined && body.slug !== null
        ? String(body.slug).trim()
        : undefined;
    return this.rythmsService.update(id, { title, slug });
  }

  @Delete(':id')
  async deleteRythm(@Param('id', ParseIntPipe) id: number) {
    return this.rythmsService.remove(id);
  }
}
