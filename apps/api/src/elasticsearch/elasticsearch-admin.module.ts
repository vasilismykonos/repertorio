// apps/api/src/elasticsearch/elasticsearch-admin.module.ts

import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";

import { ElasticsearchAdminController } from "./elasticsearch-admin.controller";
import { ElasticSongsController } from "./elastic-songs.controller";
import { ElasticsearchReindexService } from "./elasticsearch-reindex.service";

@Module({
  imports: [PrismaModule],
  controllers: [ElasticsearchAdminController, ElasticSongsController],
  providers: [ElasticsearchReindexService],
})
export class ElasticsearchAdminModule {}
