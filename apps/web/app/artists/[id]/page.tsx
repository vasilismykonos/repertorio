// apps/web/app/artists/[id]/page.tsx
import Link from "next/link";
import type { Metadata } from "next";

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

import ActionBar from "@/app/components/ActionBar";
import { LinkButton } from "@/app/components/buttons";

type ArtistDetail = {
  id: number;
  title: string;
  firstName: string | null;
  lastName: string | null;
  sex: string | null;
  bornYear: number | null;
  dieYear: number | null;
  imageUrl: string | null;
  biography: string | null;
  wikiUrl: string | null;

  // NOTE: αυτή τη στιγμή το /artists/:id ΔΕΝ επιστρέφει roles, άρα δεν το χρησιμοποιούμε εδώ
  roles?: any[];
};

type ArtistRoleCounts = {
  artistId: number;
  composer: number;
  lyricist: number;
  singerFront: number;
  singerBack: number;
};

type PageProps = {
  params: { id: string };
};

const ROLE_LABELS = {
  composer: "Συνθέτης",
  lyricist: "Στιχουργός",
  singerFront: "Κύρια φωνή",
  singerBack: "Δεύτερη φωνή",
} as const;

/**
 * Χτίζει URL στο /songs με query params συμβατά με το SongsSearchClient.
 * - composerIds, lyricistIds, singerFrontIds, singerBackIds: CSV IDs
 * - take/skip defaults για reset σελίδας
 */
function buildSongsUrl(patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  params.set("take", "50");
  params.set("skip", "0");

  for (const [k, v] of Object.entries(patch)) {
    const val = (v ?? "").trim();
    if (val) params.set(k, val);
  }

  return `/songs?${params.toString()}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) return { title: "Καλλιτέχνης | Repertorio.net" };

  try {
    const artist = await fetchJson<ArtistDetail>(`/artists/${idNum}`);
    const baseTitle = artist.title;
    const description =
      (artist.biography || "").slice(0, 160) || `Προφίλ καλλιτέχνη ${baseTitle} στο Repertorio.net`;

    return {
      title: `${baseTitle} – Καλλιτέχνες | Repertorio.net`,
      description,
    };
  } catch {
    return { title: "Καλλιτέχνης | Repertorio.net" };
  }
}

export default async function ArtistPage({ params }: PageProps) {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return (
      <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto", color: "#fff" }}>
        <p>Μη έγκυρο ID καλλιτέχνη.</p>
      </section>
    );
  }

  let artist: ArtistDetail;
  try {
    artist = await fetchJson<ArtistDetail>(`/artists/${idNum}`);
  } catch {
    return (
      <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto", color: "#fff" }}>
        <p>Δεν βρέθηκε καλλιτέχνης.</p>
      </section>
    );
  }

  // Counts από Elasticsearch (endpoint /songs-es/artist-role-counts)
  let roleCounts: ArtistRoleCounts | null = null;
  try {
    roleCounts = await fetchJson<ArtistRoleCounts>(`/songs-es/artist-role-counts?artistId=${idNum}`);
  } catch {
    roleCounts = null;
  }

  const currentUser = await getCurrentUserFromApi().catch(() => null);
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  const canEdit = !!currentUser && allowedRoles.includes(currentUser.role as UserRole);

  const displayName =
    artist.firstName || artist.lastName
      ? `${artist.firstName ?? ""} ${artist.lastName ?? ""}`.trim() || artist.title
      : artist.title;

  const years =
    artist.bornYear || artist.dieYear
      ? `${artist.bornYear ?? "?"} – ${artist.dieYear ?? ""}`.trim()
      : "";

  const roleLinks = (() => {
    if (!roleCounts) return [];

    const items = [
      {
        key: "composer",
        label: ROLE_LABELS.composer,
        count: roleCounts.composer ?? 0,
        href: buildSongsUrl({ composerIds: String(idNum) }),
      },
      {
        key: "lyricist",
        label: ROLE_LABELS.lyricist,
        count: roleCounts.lyricist ?? 0,
        href: buildSongsUrl({ lyricistIds: String(idNum) }),
      },
      {
        key: "singerFront",
        label: ROLE_LABELS.singerFront,
        count: roleCounts.singerFront ?? 0,
        href: buildSongsUrl({ singerFrontIds: String(idNum) }),
      },
      {
        key: "singerBack",
        label: ROLE_LABELS.singerBack,
        count: roleCounts.singerBack ?? 0,
        href: buildSongsUrl({ singerBackIds: String(idNum) }),
      },
    ];

    return items.filter((x) => x.count > 0);
  })();

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto", color: "#fff" }}>
      <ActionBar
        left={
          <LinkButton
            href="/artists"
            action="back"
            variant="secondary"
            title="Πίσω στη λίστα καλλιτεχνών"
          >
            Πίσω
          </LinkButton>
        }
        right={
          canEdit ? (
            <LinkButton
              href={`/artists/${artist.id}/edit`}
              action="edit"
              variant="secondary"
              title="Επεξεργασία καλλιτέχνη"
            >
              Επεξεργασία
            </LinkButton>
          ) : null
        }
      />

      <div style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "flex-start" }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            backgroundColor: "#333",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
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
            <span style={{ fontSize: 48 }}>{displayName.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>{displayName}</h1>

          {years ? <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>{years}</div> : null}

          {artist.title && artist.title !== displayName ? (
            <div style={{ fontSize: 14, color: "#aaa", marginBottom: 8 }}>{artist.title}</div>
          ) : null}

          {artist.sex ? (
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>Φύλο: {artist.sex}</div>
          ) : null}

          {artist.wikiUrl ? (
            <div style={{ marginTop: 8 }}>
              <a
                href={artist.wikiUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#66c2ff", textDecoration: "none" }}
              >
                Προβολή στη Wikipedia
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {/* ✅ Ρόλοι ΠΑΝΩ από τη βιογραφία (ΜΟΝΟ μία φορά) */}
     

  {roleCounts == null ? (
  <p style={{ fontSize: 14, color: "#ccc", marginBottom: 24 }}>
    Δεν ήταν δυνατή η ανάγνωση ρόλων.
  </p>
) : roleLinks.length === 0 ? (
  <p style={{ fontSize: 14, color: "#ccc", marginBottom: 24 }}>
    Δεν βρέθηκαν συμμετοχές για αυτόν τον καλλιτέχνη.
  </p>
) : (
  <div
    style={{
      display: "flex",
      flexDirection: "column", // ✅ κάθε item σε νέα γραμμή
      gap: 8,
      alignItems: "stretch",   // ✅ να πιάνει πλάτος
      marginBottom: 24,
    }}
  >
    {roleLinks.map((x) => (
      <Link
        key={x.key}
        href={x.href}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between", // ✅ label αριστερά, count δεξιά
          gap: 12,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #333",
          backgroundColor: "#111",
          color: "#fff",
          textDecoration: "none",
          fontSize: 13,
        }}
        title={`Άνοιγμα /songs φιλτραρισμένο: ${x.label}`}
      >
        <span>{x.label}</span>
        <span style={{ color: "#aaa" }}>({x.count})</span>
      </Link>
    ))}
  </div>
)}


      {artist.biography ? (
        <div style={{ marginBottom: 32, lineHeight: 1.6, fontSize: 15 }}>
          {artist.biography.split("\n").map((p, idx) => (
            <p key={idx} style={{ marginBottom: 8 }}>
              {p}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
