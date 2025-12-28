import { Controller, Get, Post, Query } from "@nestjs/common";
import { ElasticsearchReindexService } from "./elasticsearch/elasticsearch-reindex.service";


@Controller("admin/es")
export class ElasticsearchAdminController {
  constructor(private readonly reindex: ElasticsearchReindexService) {}

  @Get("status")
  status() {
    return this.reindex.getStatus();
  }

  @Get("preview")
  preview(@Query("take") takeStr?: string) {
    const take = Number(takeStr ?? "25");
    return this.reindex.preview(Number.isFinite(take) ? take : 25);
  }

  @Post("reindex")
  reindexNow(@Query("recreate") recreate?: string) {
    return this.reindex.startReindexNow({
      recreate: recreate === "1" || recreate === "true",
    });
  }
}
