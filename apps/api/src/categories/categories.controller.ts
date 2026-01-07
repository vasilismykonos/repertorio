// apps/api/src/categories/categories.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CategoriesService } from "./categories.service";

/**
 * REST controller for managing song categories.  Provides endpoints for
 * listing, searching, creating, retrieving and updating categories.  The
 * business logic lives in the service; the controller performs minimal
 * validation and parameter parsing.
 */
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * Lists categories with optional search.  Accepts query parameters:
   * - `q`: case-insensitive search term matched against the title
   * - `skip`: number of records to skip (for pagination)
   * - `take`: maximum number of records to return (capped at 200)
   */
  @Get()
  async listCategories(
    @Query("q") q?: string,
    @Query("skip") skipRaw?: string,
    @Query("take") takeRaw?: string,
  ) {
    const skip = Number.parseInt(skipRaw ?? "");
    const take = Number.parseInt(takeRaw ?? "");
    return this.categoriesService.findAll({
      q: q?.trim() || undefined,
      skip: Number.isFinite(skip) && skip >= 0 ? skip : undefined,
      take: Number.isFinite(take) && take > 0 ? take : undefined,
    });
  }

  /**
   * Retrieves a single category by id.
   */
  @Get(":id")
  async getCategoryById(@Param("id", ParseIntPipe) id: number) {
    return this.categoriesService.findById(id);
  }

  /**
   * Creates a new category.  Expects a JSON body with at least a `title`.
   * An optional `slug` may be provided; if omitted or blank the slug is
   * derived from the title.
   */
  @Post()
  async createCategory(@Body() body: any) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid request body");
    }
    const title = String(body.title ?? "").trim();
    const slug = body.slug !== undefined ? String(body.slug ?? "").trim() : undefined;
    return this.categoriesService.create({ title, slug });
  }

  /**
   * Updates an existing category.  Accepts a JSON body with optional
   * `title` and `slug`.  If the slug is omitted or blank it will be
   * regenerated from the new or existing title.
   */
  @Patch(":id")
  async updateCategory(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Invalid request body");
    }
    const title = body.title !== undefined ? String(body.title ?? "").trim() : undefined;
    const slug = body.slug !== undefined ? String(body.slug ?? "").trim() : undefined;
    return this.categoriesService.update(id, { title, slug });
  }

  /**
   * Deletes an existing category.
   *
   * Policy: if the category is used by songs, deletion is rejected with 400
   * (so we avoid accidental FK breaks). Adjust to your desired behavior.
   */
  @Delete(":id")
  async deleteCategory(@Param("id", ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}