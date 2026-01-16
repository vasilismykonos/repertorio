// apps/web/app/rythms/page.tsx
import { fetchJson } from "@/lib/api";

import RythmsPageClient, {
  type RythmListItem,
  type RythmSortKey,
} from "./RythmsPageClient";

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

function parseSort(v: string): RythmSortKey {
  return v === "title_desc" ? "title_desc" : "title_asc";
}

export default async function RythmsPage({ searchParams }: PageProps) {
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

  const sort = parseSort(firstParam(searchParams?.sort));

  let rythms: RythmListItem[] = [];
  let loadError = false;

  try {
    // API επιστρέφει όλο το array -> client-side filtering/paging
    rythms = await fetchJson<RythmListItem[]>("/rythms");
  } catch {
    loadError = true;
  }

  return (
    <RythmsPageClient
      q={q}
      take={take}
      skip={skip}
      sort={sort}
      rythms={rythms}
      loadError={loadError}
    />
  );
}
