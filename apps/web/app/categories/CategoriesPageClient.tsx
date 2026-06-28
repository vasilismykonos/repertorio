// apps/web/app/categories/CategoriesPageClient.tsx
"use client";

import Link from "next/link";
import { ArrowUpDown, Music2, Plus, Search } from "lucide-react";

import { Button, LinkButton } from "@/app/components/buttons";

export type CategoryListItem = {
  id: number;
  title: string;
  slug: string;
  songsCount: number;
};

export type CategorySortKey = "title_asc" | "title_desc";

type Props = {
  q: string;
  take: number;
  skip: number;
  sort: CategorySortKey;
  categories: CategoryListItem[];
  loadError: boolean;
};

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildPageUrl(q: string, take: number, skip: number, sort: CategorySortKey) {
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", String(skip));
  params.set("sort", sort);
  if (q) params.set("q", q);
  return `/categories?${params.toString()}`;
}

function buildSongsUrl(categoryId: number) {
  return `/songs?take=50&skip=0&category_id=${categoryId}`;
}

function firstLetter(value: string) {
  return (value || "?").trim().slice(0, 1).toLocaleUpperCase("el");
}

export default function CategoriesPageClient({
  q,
  take,
  skip,
  sort,
  categories,
  loadError,
}: Props) {
  const filtered = loadError
    ? []
    : categories.filter((category) => {
        if (!q) return true;
        const needle = q.toLocaleLowerCase("el");
        const haystack = `${category.title ?? ""} ${category.slug ?? ""}`.toLocaleLowerCase("el");
        return haystack.includes(needle);
      });

  filtered.sort((a, b) => {
    const cmp = a.title.localeCompare(b.title, "el");
    return sort === "title_desc" ? -cmp : cmp;
  });

  const total = filtered.length;
  const safeSkip = clampInt(skip, 0, Math.max(0, total === 0 ? 0 : total - 1), 0);
  const pageItems = filtered.slice(safeSkip, safeSkip + take);
  const hasPrev = safeSkip > 0;
  const hasNext = safeSkip + take < total;
  const nextSort: CategorySortKey = sort === "title_asc" ? "title_desc" : "title_asc";
  const sortLabel = sort === "title_asc" ? "Α-Ω" : "Ω-Α";
  const nextSortLabel = sort === "title_asc" ? "Ω-Α" : "Α-Ω";

  return (
    <section className="categories-page categories-page--compact">
      <header className="categories-header">
        <div>
          <h1>Κατηγορίες</h1>
          <p>
            {total} {total === 1 ? "κατηγορία" : "κατηγορίες"}
          </p>
        </div>

        <LinkButton href="/categories/new" variant="primary" action="new" showLabel icon={Plus}>
          Νέα κατηγορία
        </LinkButton>
      </header>

      <section className="categories-toolbar" aria-label="Φίλτρα κατηγοριών">
        <form method="GET" action="/categories" className="categories-search-form">
          <label className="categories-search">
            <Search size={17} />
            <input
              type="text"
              name="q"
              placeholder="Αναζήτηση κατηγορίας..."
              defaultValue={q}
            />
          </label>

          <select name="take" defaultValue={String(take)} aria-label="Πλήθος ανά σελίδα">
            <option value="25">25 / σελίδα</option>
            <option value="50">50 / σελίδα</option>
            <option value="100">100 / σελίδα</option>
            <option value="200">200 / σελίδα</option>
          </select>

          <input type="hidden" name="skip" value="0" />
          <input type="hidden" name="sort" value={sort} />

          <Button type="submit" variant="primary" action="search" showLabel>
            Αναζήτηση
          </Button>

          {q ? (
            <LinkButton href={buildPageUrl("", take, 0, sort)} variant="secondary" action="cancel">
              Καθαρισμός
            </LinkButton>
          ) : null}
        </form>

        <LinkButton
          href={buildPageUrl(q, take, 0, nextSort)}
          variant="secondary"
          action="sort"
          showLabel
          icon={ArrowUpDown}
          title={`Ταξινόμηση ${nextSortLabel}`}
        >
          {sortLabel}
        </LinkButton>
      </section>

      {loadError ? (
        <div className="categories-empty error">
          Σφάλμα φόρτωσης κατηγοριών. Παρακαλώ δοκιμάστε ξανά αργότερα.
        </div>
      ) : total === 0 ? (
        <div className="categories-empty">Δεν βρέθηκαν κατηγορίες.</div>
      ) : (
        <>
          <div className="categories-results-meta">
            <span>
              Εμφάνιση {safeSkip + 1}-{Math.min(safeSkip + take, total)} από {total}
            </span>
          </div>

          <div className="categories-grid">
            {pageItems.map((category) => (
              <Link
                key={category.id}
                href={buildSongsUrl(category.id)}
                className="category-card category-card--link"
                title={`Προβολή τραγουδιών: ${category.title}`}
              >
                <span className="category-card-main">
                  <span className="category-card-letter">{firstLetter(category.title)}</span>
                  <span className="category-card-text">
                    <strong>{category.title}</strong>
                  </span>
                </span>

                <span className="category-card-count">
                  <Music2 size={15} />
                  {category.songsCount}
                </span>
              </Link>
            ))}
          </div>

          {total > take ? (
            <nav className="categories-pagination" aria-label="Σελιδοποίηση κατηγοριών">
              {hasPrev ? (
                <LinkButton
                  href={buildPageUrl(q, take, Math.max(0, safeSkip - take), sort)}
                  variant="secondary"
                  action="back"
                  showLabel
                >
                  Προηγούμενη
                </LinkButton>
              ) : (
                <span />
              )}

              {hasNext ? (
                <LinkButton
                  href={buildPageUrl(q, take, safeSkip + take, sort)}
                  variant="secondary"
                  action="select"
                  showLabel
                >
                  Επόμενη
                </LinkButton>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
