// apps/web/app/artists/page.tsx
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { Button, LinkButton } from "@/app/components/buttons";

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

type ArtistListItem = {
  id: number;
  title: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  bornYear: number | null;
  dieYear: number | null;
};

type ArtistsSearchResponse = {
  items: ArtistListItem[];
  total: number;
  skip: number;
  take: number;
  q: string;
  role?: string[];
};

type PageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

type ArtistSortKey = "title_asc" | "title_desc";

const ALL_ROLES = [
  { key: "COMPOSER", label: "🎼 Συνθέτες" },
  { key: "LYRICIST", label: "✍️ Στιχουργοί" },
  { key: "SINGER_FRONT", label: "🎤 Ερμηνευτές Α" },
  { key: "SINGER_BACK", label: "🎶 Ερμηνευτές Β" },
];

function normalizeQueryParam(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseSort(v: string): ArtistSortKey {
  return v === "title_desc" ? "title_desc" : "title_asc";
}

function buildRoleUrl(
  activeRoles: string[],
  toggleRole: string,
  q: string,
  take: number,
  sort: ArtistSortKey,
) {
  const newRoles = activeRoles.includes(toggleRole)
    ? activeRoles.filter((r) => r !== toggleRole)
    : [...activeRoles, toggleRole];

  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", "0");
  params.set("sort", sort);
  if (q) params.set("q", q);

  newRoles.forEach((r) => params.append("role", r));
  return `/artists?${params.toString()}`;
}

function buildPageUrl(
  q: string,
  take: number,
  newSkip: number,
  roles: string[],
  sort: ArtistSortKey,
) {
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", String(newSkip));
  params.set("sort", sort);

  if (q) params.set("q", q);
  roles.forEach((r) => params.append("role", r));

  return `/artists?${params.toString()}`;
}

export default async function ArtistsPage({ searchParams }: PageProps) {
  const take = clampInt(Number(firstParam(searchParams?.take) || "50"), 5, 200, 50);
  const skip = clampInt(Number(firstParam(searchParams?.skip) || "0"), 0, 1_000_000, 0);

  const qRaw = searchParams?.q || searchParams?.search_term || "";
  const q = (Array.isArray(qRaw) ? qRaw[0] : qRaw)?.trim() ?? "";

  const sort = parseSort(firstParam(searchParams?.sort).trim());
  const activeRoles = normalizeQueryParam(searchParams?.role);

  const apiParams = new URLSearchParams();
  apiParams.set("take", String(take));
  apiParams.set("skip", String(skip));
  if (q) apiParams.set("q", q);
  activeRoles.forEach((r) => apiParams.append("role", r));

  const apiUrl = `/artists?${apiParams.toString()}`;
  const data = await fetchJson<ArtistsSearchResponse>(apiUrl);

  // Apply sorting on the returned page slice (safe without backend changes)
  const artists = [...(data.items ?? [])].sort((a, b) => {
    const cmp = (a.title ?? "").localeCompare(b.title ?? "", "el");
    return sort === "title_desc" ? -cmp : cmp;
  });

  const total = data.total ?? 0;

  const hasPrev = skip > 0;
  const hasNext = skip + take < total;

  const currentUser = await getCurrentUserFromApi().catch(() => null);
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  const canCreate = !!currentUser && allowedRoles.includes(currentUser.role as UserRole);

  // sort toggle button
  const nextSort: ArtistSortKey = sort === "title_asc" ? "title_desc" : "title_asc";
  const sortLabel = sort === "title_asc" ? "Α-Ω" : "Ω-Α";
  const sortTitle =
    sort === "title_asc"
      ? "Ταξινόμηση φθίνουσα (Ω-Α)"
      : "Ταξινόμηση αύξουσα (Α-Ω)";

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto", color: "#fff" }}>
      <ActionBar
        left={<h1 style={{ fontSize: 28, margin: 0 }}>Καλλιτέχνες</h1>}
        right={
          canCreate ? (
            <LinkButton href="/artists/new" action="new" variant="primary" title="Νέος καλλιτέχνης">
              Νέος καλλιτέχνης
            </LinkButton>
          ) : null
        }
      />

      {/* Φόρμα αναζήτησης */}
      <form
        method="GET"
        action="/artists"
        style={{
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        {/* 1) ✅ Λευκό search input */}
        <input
          type="text"
          name="q"
          placeholder="Αναζήτηση καλλιτέχνη..."
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

        {/* 3) ✅ Search button αμέσως μετά το search input */}
        <Button type="submit" variant="primary" action="search" title="Αναζήτηση">
          Αναζήτηση
        </Button>

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

        {/* 2) ✅ Ταξινόμηση δίπλα στο take */}
        <LinkButton
          href={buildPageUrl(q, take, 0, activeRoles, nextSort)}
          variant="secondary"
          title={sortTitle}
          action="sort"
          showLabel
          iconOnly={false}
        >
          Ταξινόμηση: {sortLabel}
        </LinkButton>

        {/* κρατάμε roles */}
        {activeRoles.map((r) => (
          <input key={r} type="hidden" name="role" value={r} />
        ))}

        {/* κρατάμε sort */}
        <input type="hidden" name="sort" value={sort} />

        {/* σε νέα αναζήτηση πάμε στην αρχή */}
        <input type="hidden" name="skip" value="0" />
      </form>

      {/* MULTI-SELECT ΡΟΛΩΝ */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {ALL_ROLES.map(({ key, label }) => {
          const isActive = activeRoles.includes(key);

          return (
            <Link
              key={key}
              href={buildRoleUrl(activeRoles, key, q, take, sort)}
              style={{
                padding: "6px 14px",
                borderRadius: 18,
                border: isActive ? "2px solid #fff" : "1px solid #666",
                backgroundColor: "#111",
                color: "#fff",
                fontSize: "0.9rem",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Σύνοψη */}
      <div style={{ marginBottom: 16, fontSize: 14 }}>
        {total === 0 ? (
          <span>Δεν βρέθηκαν καλλιτέχνες.</span>
        ) : (
          <span>
            Βρέθηκαν {total} καλλιτέχνες. Εμφάνιση {skip + 1}–{Math.min(skip + take, total)}.
          </span>
        )}
      </div>

      {/* Λίστα καλλιτεχνών */}
      {artists.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {artists.map((artist) => {
            const displayName =
              artist.firstName || artist.lastName
                ? `${artist.firstName ?? ""} ${artist.lastName ?? ""}`.trim() || artist.title
                : artist.title;

            const years =
              artist.bornYear || artist.dieYear
                ? `${artist.bornYear ?? "?"} – ${artist.dieYear ?? ""}`
                : "";

            return (
              <li
                key={artist.id}
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
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    overflow: "hidden",
                    backgroundColor: "#222",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {artist.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={artist.imageUrl}
                      alt={displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 24 }}>{displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <Link
                    href={`/artists/${artist.id}`}
                    style={{
                      color: "#fff",
                      textDecoration: "none",
                      fontSize: 18,
                      fontWeight: 600,
                    }}
                  >
                    {displayName}
                  </Link>

                  {years ? <div style={{ fontSize: 13, color: "#ccc" }}>{years}</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Σελιδοποίηση */}
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
              href={buildPageUrl(q, take, Math.max(0, skip - take), activeRoles, sort)}
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
              href={buildPageUrl(q, take, skip + take, activeRoles, sort)}
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
