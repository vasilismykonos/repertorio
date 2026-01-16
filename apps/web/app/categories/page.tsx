// apps/web/app/categories/page.tsx
import { fetchJson } from "@/lib/api";

import CategoriesPageClient, {
  type CategoryListItem,
  type CategorySortKey,
} from "./CategoriesPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseSort(v: string): CategorySortKey {
  return v === "title_desc" ? "title_desc" : "title_asc";
}

export default async function CategoriesPage({ searchParams }: PageProps) {
  const q = firstParam(searchParams?.q).trim();

  const take = clampInt(
    Number(firstParam(searchParams?.take) || "50"),
    5,
    200,
    50,
  );

  const skip = clampInt(
    Number(firstParam(searchParams?.skip) || "0"),
    0,
    1_000_000,
    0,
  );

  const sort = parseSort(firstParam(searchParams?.sort).trim());

  let categories: CategoryListItem[] = [];
  let loadError = false;
  try {
    categories = await fetchJson<CategoryListItem[]>("/categories");
  } catch {
    loadError = true;
  }

  return (
    <CategoriesPageClient
      q={q}
      take={take}
      skip={skip}
      sort={sort}
      categories={categories}
      loadError={loadError}
    />
  );
}
