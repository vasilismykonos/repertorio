// src/artists/artists.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ArtistsService } from './artists.service';

@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Get()
  async getAllArtists() {
    return this.artistsService.findAll();
  }
}

