// apps/web/app/artists/page.tsx
import Link from "next/link";
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

function buildRoleUrl(
  activeRoles: string[],
  toggleRole: string,
  q: string,
  take: number,
) {
  const newRoles = activeRoles.includes(toggleRole)
    ? activeRoles.filter((r) => r !== toggleRole)
    : [...activeRoles, toggleRole];

  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", "0");
  if (q) params.set("q", q);

  newRoles.forEach((r) => params.append("role", r));

  return `/artists?${params.toString()}`;
}

function buildPageUrl(
  q: string,
  take: number,
  newSkip: number,
  roles: string[],
) {
  const params = new URLSearchParams();
  params.set("take", String(take));
  params.set("skip", String(newSkip));

  if (q) params.set("q", q);

  roles.forEach((r) => params.append("role", r));

  return `/artists?${params.toString()}`;
}

export default async function ArtistsPage({ searchParams }: PageProps) {
  const take = Number(searchParams?.take ?? "50");
  const skip = Number(searchParams?.skip ?? "0");

  const qRaw = searchParams?.q || searchParams?.search_term || "";
  const q = (Array.isArray(qRaw) ? qRaw[0] : qRaw)?.trim() ?? "";

  const activeRoles = normalizeQueryParam(searchParams?.role);

  const apiParams = new URLSearchParams();
  apiParams.set("take", String(take));
  apiParams.set("skip", String(skip));
  if (q) apiParams.set("q", q);

  activeRoles.forEach((r) => apiParams.append("role", r));

  const apiUrl = `/artists?${apiParams.toString()}`;
  const data = await fetchJson<ArtistsSearchResponse>(apiUrl);
  const artists = data.items;
  const total = data.total;

  const hasPrev = skip > 0;
  const hasNext = skip + take < total;

  // ✅ δικαίωμα δημιουργίας καλλιτέχνη
  const currentUser = await getCurrentUserFromApi().catch(() => null);
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  const canCreate = !!currentUser && allowedRoles.includes(currentUser.role as UserRole);

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 900,
        margin: "0 auto",
        color: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>Καλλιτέχνες</h1>

        {canCreate && (
          <Link
            href="/artists/new"
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #2f2f2f",
              backgroundColor: "#111",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            + Νέος καλλιτέχνης
          </Link>
        )}
      </div>

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
        <input
          type="text"
          name="q"
          placeholder="Αναζήτηση καλλιτέχνη..."
          defaultValue={q}
          style={{
            flex: "1 1 240px",
            padding: "8px 12px",
            borderRadius: 20,
            border: "1px solid #555",
            backgroundColor: "#111",
            color: "#fff",
          }}
        />

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
        </select>

        <button
          type="submit"
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            backgroundColor: "#cc3333",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Αναζήτηση
        </button>
      </form>

      {/* MULTI-SELECT ΡΟΛΩΝ */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {ALL_ROLES.map(({ key, label }) => {
          const isActive = activeRoles.includes(key);

          return (
            <Link
              key={key}
              href={buildRoleUrl(activeRoles, key, q, take)}
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
                ? `${artist.firstName ?? ""} ${artist.lastName ?? ""}`.trim() ||
                  artist.title
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
                    <span style={{ fontSize: 24 }}>
                      {displayName.charAt(0).toUpperCase()}
                    </span>
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

                  {years && <div style={{ fontSize: 13, color: "#ccc" }}>{years}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Σελιδοποίηση */}
      {total > take && (
        <div
          style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {hasPrev ? (
            <Link
              href={buildPageUrl(q, take, Math.max(0, skip - take), activeRoles)}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                backgroundColor: "#333",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              ← Προηγούμενη
            </Link>
          ) : (
            <div />
          )}

          {hasNext && (
            <Link
              href={buildPageUrl(q, take, skip + take, activeRoles)}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                backgroundColor: "#333",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              Επόμενη →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
