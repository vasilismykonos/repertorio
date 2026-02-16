// apps/api/src/songs/assets.controller.ts

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
 * Assets are now managed exclusively through the unified Song Full endpoints:
 *   - POST  /songs/full
 *   - PATCH /songs/:id/full
 *
 * These endpoints remain only to fail fast and prevent accidental usage.
 */
@Controller('songs')
export class SongAssetsController {
  @Get(':id/assets')
  async list(@Param('id', ParseIntPipe) _id: number) {
    throw new GoneException(
      'Deprecated endpoint. Use GET /songs/:id (assets are included) or PATCH /songs/:id/full.',
    );
  }

  @Put(':id/assets')
  async replace(@Param('id', ParseIntPipe) _id: number) {
    throw new GoneException('Deprecated endpoint. Use PATCH /songs/:id/full.');
  }
}
