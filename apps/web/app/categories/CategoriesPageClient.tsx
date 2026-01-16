// apps/web/app/categories/CategoriesPageClient.tsx
"use client";

import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
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

export default function CategoriesPageClient({
  q,
  take,
  skip,
  sort,
  categories,
  loadError,
}: Props) {
  // client-side search/filter
  const filtered = loadError
    ? []
    : categories.filter((c) => {
        if (!q) return true;
        const hay = `${c.title ?? ""} ${c.slug ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      });

  // sort (A-Ω / Ω-Α)
  filtered.sort((a, b) => {
    const cmp = a.title.localeCompare(b.title, "el");
    return sort === "title_desc" ? -cmp : cmp;
  });

  const total = filtered.length;

  // client-side pagination
  const safeSkip = clampInt(
    skip,
    0,
    Math.max(0, total === 0 ? 0 : total - 1),
    0,
  );
  const pageItems = filtered.slice(safeSkip, safeSkip + take);

  const hasPrev = safeSkip > 0;
  const hasNext = safeSkip + take < total;

  // sort toggle
  const nextSort: CategorySortKey = sort === "title_asc" ? "title_desc" : "title_asc";
  const sortLabel = sort === "title_asc" ? "Α-Ω" : "Ω-Α";
  const sortTitle =
    sort === "title_asc"
      ? "Ταξινόμηση φθίνουσα (Ω-Α)"
      : "Ταξινόμηση αύξουσα (Α-Ω)";

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 900,
        margin: "0 auto",
        color: "#fff",
      }}
    >
      <ActionBar
        left={<h1 style={{ fontSize: 28, margin: 0 }}>Κατηγορίες</h1>}
        right={
          <LinkButton
            href="/categories/new"
            variant="primary"
            title="Νέα κατηγορία"
            action="new"
          >
            Νέα κατηγορία
          </LinkButton>
        }
      />

      <form
        method="GET"
        action="/categories"
        style={{
          margin: "12px 0 16px",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        {/* Search input (λευκό) */}
        <input
          type="text"
          name="q"
          placeholder="Αναζήτηση κατηγορίας..."
          defaultValue={q}
          style={{
            flex: "1 1 240px",
            padding: "8px 12px",
            borderRadius: 20,
            border: "1px solid #ccc",
            backgroundColor: "#fff",
            color: "#000",
          }}
        />

        {/* ✅ Search button ακριβώς μετά το πεδίο search */}
        <Button type="submit" variant="primary" title="Αναζήτηση" action="search">
          Αναζήτηση
        </Button>

        {/* Page size */}
        <select
          name="take"
          defaultValue={String(take)}
          style={{
            padding: "8px 12px",
            borderRadius: 20,
            border: "1px solid #555",
            backgroundColor: "#111",
            color: "#fff",
          }}
        >
          <option value="25">25 / σελίδα</option>
          <option value="50">50 / σελίδα</option>
          <option value="100">100 / σελίδα</option>
          <option value="200">200 / σελίδα</option>
        </select>

        {/* ✅ Ταξινόμηση δίπλα στο take (όπως rythms) */}
        <LinkButton
          href={buildPageUrl(q, take, 0, nextSort)}
          variant="secondary"
          title={sortTitle}
          action="sort"
          showLabel
          iconOnly={false}
        >
          Ταξινόμηση: {sortLabel}
        </LinkButton>

        {/* Σε νέα αναζήτηση πάμε στην αρχή */}
        <input type="hidden" name="skip" value="0" />

        {/* Κρατάμε το sort όταν κάνουμε submit */}
        <input type="hidden" name="sort" value={sort} />

        {/* Καθαρισμός φίλτρου */}
        {q ? (
          <LinkButton
            href={buildPageUrl("", take, 0, sort)}
            variant="secondary"
            title="Καθαρισμός"
            action="cancel"
          >
            Καθαρισμός
          </LinkButton>
        ) : null}
      </form>

      {loadError ? (
        <p style={{ color: "#e38" }}>
          Σφάλμα φόρτωσης κατηγοριών. Παρακαλώ δοκιμάστε ξανά αργότερα.
        </p>
      ) : total === 0 ? (
        <p style={{ color: "#888" }}>Δεν υπάρχουν κατηγορίες.</p>
      ) : (
        <>
          <div style={{ marginBottom: 12, fontSize: 14, color: "#ccc" }}>
            Βρέθηκαν {total} κατηγορίες.
            {total > 0 ? (
              <>
                {" "}
                Εμφάνιση {safeSkip + 1}–{Math.min(safeSkip + take, total)}.
              </>
            ) : null}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {pageItems.map((cat) => (
              <li
                key={cat.id}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #333",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <Link
                    href={`/categories/${cat.id}`}
                    style={{
                      color: "#ccc",
                      textDecoration: "none",
                      display: "inline-block",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={cat.title}
                  >
                    {cat.title}
                  </Link>
                </span>

                <Link
                  href={`/songs?take=50&skip=0&category_id=${cat.id}`}
                  style={{
                    color: "#888",
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                  }}
                  title="Προβολή τραγουδιών αυτής της κατηγορίας"
                >
                  {cat.songsCount} τραγούδι(α)
                </Link>
              </li>
            ))}
          </ul>

          {total > take ? (
            <div
              style={{
                marginTop: 24,
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              {hasPrev ? (
                <LinkButton
                  href={buildPageUrl(q, take, Math.max(0, safeSkip - take), sort)}
                  variant="secondary"
                  title="Προηγούμενη"
                  action="back"
                  style={{ padding: "6px 12px", fontSize: 14 }}
                >
                  ← Προηγούμενη
                </LinkButton>
              ) : (
                <div />
              )}

              {hasNext ? (
                <LinkButton
                  href={buildPageUrl(q, take, safeSkip + take, sort)}
                  variant="secondary"
                  title="Επόμενη"
                  action="select"
                  style={{ padding: "6px 12px", fontSize: 14 }}
                >
                  Επόμενη →
                </LinkButton>
              ) : (
                <div />
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
