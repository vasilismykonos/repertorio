// apps/api/src/songs/song-credits.controller.ts

import {
  Controller,
  Get,
  GoneException,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';

/**
 * ❌ DEPRECATED (legacy split architecture)
 *
 * Credits are now managed exclusively through the unified Song Full endpoints:
 *   - POST  /songs/full
 *   - PATCH /songs/:id/full
 */
@Controller('songs')
export class SongCreditsController {
  @Get(':id/credits')
  async getCredits(@Param('id', ParseIntPipe) _songId: number) {
    throw new GoneException(
      'Deprecated endpoint. Use GET /songs/:id (credits are included) or PATCH /songs/:id/full.',
    );
  }

  @Put(':id/credits')
  async replaceCredits(@Param('id', ParseIntPipe) _songId: number) {
    throw new GoneException('Deprecated endpoint. Use PATCH /songs/:id/full.');
  }
}
