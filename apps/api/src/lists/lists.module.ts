import { Module } from '@nestjs/common';
import { ListsController } from './lists.controller';
import { ListsService } from './lists.service';
import { PrismaService } from '../prisma/prisma.service';
import { ElasticsearchSongsSyncService } from '../elasticsearch/elasticsearch-songs-sync.service';

@Module({
  controllers: [ListsController],
  providers: [ListsService, PrismaService, ElasticsearchSongsSyncService],
})
export class ListsModule {}
