// apps/web/app/users/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { Button, LinkButton } from "@/app/components/buttons";

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

export const metadata: Metadata = {
  title: "Χρήστες | Repertorio Next",
  description:
    "Λίστα χρηστών του Repertorio (σελίδα διαχείρισης μόνο για διαχειριστές).",
};

type UserListItem = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  createdSongsCount: number;
  createdVersionsCount: number;
  avatarUrl?: string | null;
};

type UsersResponse = {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type UsersPageSearchParams = {
  search?: string;
  page?: string;
  pageSize?: string;
  // κρατάμε συμβατότητα με το υπάρχον contract
  orderby?: string;
  order?: string;
};

type UsersSortKey = "name_asc" | "name_desc";

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseSortFromParams(orderby: string, order: string): UsersSortKey {
  // Στο UI κάνουμε ένα απλό "Α-Ω / Ω-Α" πάνω στο displayName.
  // Αν ο χρήστης έχει άλλα params, τα αγνοούμε για το UI toggle.
  if (orderby === "displayName" && order === "desc") return "name_desc";
  return "name_asc";
}

function buildUsersUrl(params: {
  search: string;
  page: number;
  pageSize: number;
  sortKey: UsersSortKey;
}): string {
  const { search, page, pageSize, sortKey } = params;
  const qs = new URLSearchParams();

  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (search) qs.set("search", search);

  // κρατάμε API contract: sort/order
  qs.set("sort", "displayName");
  qs.set("order", sortKey === "name_desc" ? "desc" : "asc");

  return `/users?${qs.toString()}`;
}

function buildPageHref(params: {
  search: string;
  page: number;
  pageSize: number;
  sortKey: UsersSortKey;
}): string {
  const { search, page, pageSize, sortKey } = params;
  const qs = new URLSearchParams();

  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (search) qs.set("search", search);

  // για να έχεις stable URLs στο UI (και να επιβιώνει refresh)
  qs.set("orderby", "displayName");
  qs.set("order", sortKey === "name_desc" ? "desc" : "asc");

  return `/users?${qs.toString()}`;
}

function deriveDisplayName(u: UserListItem): string {
  return u.displayName ?? u.username ?? u.email ?? `User #${u.id}`;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: UsersPageSearchParams;
}) {
  const currentUser = await getCurrentUserFromApi().catch(() => null);
  const isAdmin = currentUser?.role === "ADMIN";

  const search = (searchParams?.search ?? "").trim();
  const page = clampInt(Number(searchParams?.page ?? "1") || 1, 1, 1_000_000, 1);
  const pageSize = clampInt(
    Number(searchParams?.pageSize ?? "50") || 50,
    5,
    200,
    50,
  );

  const orderby = firstParam(searchParams?.orderby || "displayName").trim() || "displayName";
  const order = firstParam(searchParams?.order || "asc").trim() || "asc";
  const sortKey = parseSortFromParams(orderby, order);

  if (!currentUser) {
    return (
      <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto", color: "#fff" }}>
        <ActionBar left={<h1 style={{ fontSize: 28, margin: 0 }}>Χρήστες</h1>} />
        <div style={{ color: "#ccc", marginTop: 12 }}>
          Πρέπει να συνδεθείτε για να δείτε τη σελίδα χρηστών.{" "}
          <a href="/api/auth/signin">Μετάβαση στη σελίδα σύνδεσης</a>
        </div>
      </section>
    );
  }


  // API call (συμβατό με τον παλιό κώδικα users)
  const apiUrl = buildUsersUrl({ search, page, pageSize, sortKey });
  const data = await fetchJson<UsersResponse>(apiUrl);

  const items = data.items ?? [];
  const total = data.total ?? 0;
  const totalPages = data.totalPages ?? 1;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  // sort toggle (artists-like)
  const nextSortKey: UsersSortKey = sortKey === "name_asc" ? "name_desc" : "name_asc";
  const sortLabel = sortKey === "name_asc" ? "Α-Ω" : "Ω-Α";
  const sortTitle =
    sortKey === "name_asc"
      ? "Ταξινόμηση φθίνουσα (Ω-Α)"
      : "Ταξινόμηση αύξουσα (Α-Ω)";

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto", color: "#fff" }}>
      <ActionBar left={<h1 style={{ fontSize: 28, margin: 0 }}>Χρήστες</h1>} />

      {/* Search form (artists-like) */}
      <form
        method="GET"
        action="/users"
        style={{
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          name="search"
          placeholder="Αναζήτηση χρήστη..."
          defaultValue={search}
          style={{
            flex: "1 1 240px",
            padding: "8px 12px",
            borderRadius: 20,
            border: "1px solid #ccc",
            backgroundColor: "#fff",
            color: "#000",
          }}
        />

        <Button type="submit" variant="primary" action="search" title="Αναζήτηση">
          Αναζήτηση
        </Button>

        <select
          name="pageSize"
          defaultValue={String(pageSize)}
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

        {/* sort toggle: το κρατάμε στο UI, αλλά παράγουμε orderby/order ώστε να “γράφεται” στο URL */}
        <LinkButton
          href={buildPageHref({ search, page: 1, pageSize, sortKey: nextSortKey })}
          variant="secondary"
          action="sort"
          title={sortTitle}
          showLabel
        >
          Ταξινόμηση: {sortLabel}
        </LinkButton>

        {/* reset page σε νέα αναζήτηση */}
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="orderby" value="displayName" />
        <input type="hidden" name="order" value={sortKey === "name_desc" ? "desc" : "asc"} />
      </form>

      {/* Summary */}
      <div style={{ marginBottom: 16, fontSize: 14 }}>
        {total === 0 ? (
          <span>Δεν βρέθηκαν χρήστες.</span>
        ) : (
          <span>
            Βρέθηκαν {total} χρήστες. Εμφάνιση{" "}
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}.
          </span>
        )}
      </div>

      {/* LIST (artists-like) */}
      {items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((u) => {
            const displayName = deriveDisplayName(u);
            const avatarText = displayName.charAt(0).toUpperCase() || "?";

            const songsHref = `/songs?createdByUserId=${u.id}`;
            const versionsHref = `/versions?createdByUserId=${u.id}`;

            return (
              <li
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid #333",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    overflow: "hidden",
                    backgroundColor: "#222",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 20,
                  }}
                >
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.avatarUrl}
                      alt={displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span>{avatarText}</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/users/${u.id}`}
                    style={{
                      color: "#fff",
                      textDecoration: "none",
                      fontSize: 18,
                      fontWeight: 600,
                      display: "inline-block",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={displayName}
                  >
                    {displayName}
                  </Link>

                  {/* 1η “δευτερη γραμμή”: email/role */}
                  <div style={{ fontSize: 13, color: "#ccc" }}>
                    {u.email || "—"} · {u.role}
                  </div>

                  {/* 2η “δευτερη γραμμή”: Songs / Versions counts */}
                  <div style={{ fontSize: 13, color: "#ccc", marginTop: 2 }}>
                    Τραγούδια:{" "}
                    {u.createdSongsCount > 0 ? (
                      <Link href={songsHref} style={{ color: "#fff", textDecoration: "underline" }}>
                        {u.createdSongsCount}
                      </Link>
                    ) : (
                      <span>{u.createdSongsCount}</span>
                    )}
                    {" · "}
                    Εκδόσεις:{" "}
                    {u.createdVersionsCount > 0 ? (
                      <Link
                        href={versionsHref}
                        style={{ color: "#fff", textDecoration: "underline" }}
                      >
                        {u.createdVersionsCount}
                      </Link>
                    ) : (
                      <span>{u.createdVersionsCount}</span>
                    )}
                  </div>
                </div>

                {/* ✅ ΑΦΑΙΡΕΘΗΚΕ το "Επεξεργασία" όπως ζήτησες */}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination (artists-like) */}
      {total > pageSize ? (
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
              href={buildPageHref({ search, page: page - 1, pageSize, sortKey })}
              action="back"
              variant="secondary"
              title="Προηγούμενη σελίδα"
            >
              Προηγούμενη
            </LinkButton>
          ) : (
            <div />
          )}

          {hasNext ? (
            <LinkButton
              href={buildPageHref({ search, page: page + 1, pageSize, sortKey })}
              action="select"
              variant="secondary"
              title="Επόμενη σελίδα"
            >
              Επόμενη
            </LinkButton>
          ) : (
            <div />
          )}
        </div>
      ) : null}
    </section>
  );
}
