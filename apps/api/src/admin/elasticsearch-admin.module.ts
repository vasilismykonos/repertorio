import { Module } from "@nestjs/common";
import { ElasticsearchAdminController } from "./elasticsearch-admin.controller";
import { ElasticsearchReindexService } from "./elasticsearch/elasticsearch-reindex.service";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [ElasticsearchAdminController],
  providers: [ElasticsearchReindexService, PrismaService],
})
export class ElasticsearchAdminModule {}
