// apps/api/src/songs/assets.service.ts

import { Injectable } from '@nestjs/common';
import { AssetKind, AssetType } from '@prisma/client';
import { SongsService } from './songs.service';

export type SongAssetInput = {
  id?: number;
  kind: AssetKind;
  type?: AssetType;
  title?: string | null;
  url?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: string | number | bigint | null;

  label?: string | null;
  sort?: number | null;
  isPrimary?: boolean | null;
};

@Injectable()
export class SongAssetsService {
  constructor(private readonly songsService: SongsService) {}

  async listAssets(songId: number) {
    const song = await this.songsService.findOne(songId, true);
    return song.assets;
  }

  async replaceAssets(songId: number, assets: SongAssetInput[]) {
    const song = await this.songsService.updateSong(songId, { assets });
    return song.assets;
  }
}
