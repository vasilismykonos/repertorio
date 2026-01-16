// apps/web/app/rythms/RythmsPageClient.tsx
"use client";

import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { Button, LinkButton } from "@/app/components/buttons";

export type RythmListItem = {
  id: number;
  title: string;
  songsCount: number;
};

export type RythmSortKey = "title_asc" | "title_desc";

type Props = {
  q: string;
  take: number;
  skip: number;
  sort: RythmSortKey;
  rythms: RythmListItem[];
  loadError: boolean;
};

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildPageUrl(q: string, take: number, skip: number, sort: RythmSortKey) {
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", String(skip));
  params.set("sort", sort);
  if (q) params.set("q", q);
  return `/rythms?${params.toString()}`;
}

export default function RythmsPageClient({
  q,
  take,
  skip,
  sort,
  rythms,
  loadError,
}: Props) {
  // client-side search/filter
  const filtered = loadError
    ? []
    : rythms.filter((r) => {
        if (!q) return true;
        const hay = `${r.title ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      });

  // sort
  filtered.sort((a, b) => {
    const cmp = a.title.localeCompare(b.title, "el");
    return sort === "title_desc" ? -cmp : cmp;
  });

  const total = filtered.length;

  // pagination
  const safeSkip = clampInt(
    skip,
    0,
    Math.max(0, total === 0 ? 0 : total - 1),
    0,
  );

  const pageItems = filtered.slice(safeSkip, safeSkip + take);

  const hasPrev = safeSkip > 0;
  const hasNext = safeSkip + take < total;

  // sort button toggle
  const nextSort: RythmSortKey = sort === "title_asc" ? "title_desc" : "title_asc";
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
        left={<h1 style={{ fontSize: 28, margin: 0 }}>Ρυθμοί</h1>}
        right={
          <LinkButton
            href="/rythms/new"
            variant="primary"
            title="Νέος ρυθμός"
            action="new"
          >
            Νέος ρυθμός
          </LinkButton>
        }
      />

      <form
        method="GET"
        action="/rythms"
        style={{
          margin: "12px 0 16px",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        {/* Search input */}
        <input
          type="text"
          name="q"
          placeholder="Αναζήτηση ρυθμού..."
          defaultValue={q}
          style={{
            flex: "1 1 240px",
            padding: "8px 12px",
            borderRadius: 20,
            border: "1px solid #555",
            backgroundColor: "#ffffffff",
            color: "#fff",
          }}
        />

        {/* Search button ακριβώς μετά το πεδίο search */}
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

        {/* ✅ Sort: χωρίς inline padding + κλειδώνουμε label/όχι icon-only */}
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

        {/* Καθαρισμός */}
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
          Σφάλμα φόρτωσης ρυθμών. Παρακαλώ δοκιμάστε ξανά αργότερα.
        </p>
      ) : total === 0 ? (
        <p style={{ color: "#888" }}>Δεν υπάρχουν ρυθμοί.</p>
      ) : (
        <>
          <div style={{ marginBottom: 12, fontSize: 14, color: "#ccc" }}>
            Βρέθηκαν {total} ρυθμοί.
            {total > 0 ? (
              <>
                {" "}
                Εμφάνιση {safeSkip + 1}–{Math.min(safeSkip + take, total)}.
              </>
            ) : null}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {pageItems.map((r) => (
              <li
                key={r.id}
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
                    href={`/rythms/${r.id}`}
                    style={{
                      color: "#ccc",
                      textDecoration: "none",
                      display: "inline-block",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.title}
                  >
                    {r.title}
                  </Link>
                </span>

                <Link
                  href={`/songs?take=50&skip=0&rythm_id=${r.id}`}
                  style={{
                    color: "#888",
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                  }}
                  title="Προβολή τραγουδιών αυτού του ρυθμού"
                >
                  {r.songsCount} τραγούδι(α)
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
