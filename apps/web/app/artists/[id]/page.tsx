// apps/web/app/artists/[id]/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";
import DeleteArtistButton from "./DeleteArtistButton";

type ArtistRoleEntry = {
  songId: number;
  songTitle: string;
  versionId: number;
  versionTitle: string | null;
  year: number | null;
  role: string;
};

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
  roles: ArtistRoleEntry[];
};

type PageProps = {
  params: { id: string };
};

const ROLE_LABELS: Record<string, string> = {
  SINGER_FRONT: "Κύρια φωνή",
  SINGER_BACK: "Δεύτερη φωνή",
  SOLOIST: "Σολίστ",
  MUSICIAN: "Μουσικός",
  COMPOSER: "Συνθέτης",
  LYRICIST: "Στιχουργός",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return { title: "Καλλιτέχνης | Repertorio.net" };
  }

  try {
    const artist = await fetchJson<ArtistDetail>(`/artists/${idNum}`);
    const baseTitle = artist.title;
    const description =
      (artist.biography || "").slice(0, 160) ||
      `Προφίλ καλλιτέχνη ${baseTitle} στο Repertorio.net`;

    return {
      title: `${baseTitle} – Καλλιτέχνες | Repertorio.net`,
      description,
    };
  } catch {
    return { title: "Καλλιτέχνης | Repertorio.net" };
  }
}

function groupRolesBySong(roles: ArtistRoleEntry[]) {
  const songsMap = new Map<
    number,
    {
      songId: number;
      songTitle: string;
      versions: {
        versionId: number;
        versionTitle: string | null;
        year: number | null;
        roles: string[];
      }[];
    }
  >();

  for (const r of roles) {
    if (!songsMap.has(r.songId)) {
      songsMap.set(r.songId, {
        songId: r.songId,
        songTitle: r.songTitle,
        versions: [],
      });
    }
    const songEntry = songsMap.get(r.songId)!;

    let versionEntry = songEntry.versions.find((v) => v.versionId === r.versionId);
    if (!versionEntry) {
      versionEntry = {
        versionId: r.versionId,
        versionTitle: r.versionTitle,
        year: r.year,
        roles: [],
      };
      songEntry.versions.push(versionEntry);
    }
    if (!versionEntry.roles.includes(r.role)) {
      versionEntry.roles.push(r.role);
    }
  }

  const songs = Array.from(songsMap.values());

  songs.sort((a, b) => {
    const titleCompare = a.songTitle.localeCompare(b.songTitle, "el");
    if (titleCompare !== 0) return titleCompare;

    const aMinYear =
      a.versions.reduce<number | null>((acc, v) => {
        if (v.year == null) return acc;
        if (acc == null) return v.year;
        return Math.min(acc, v.year);
      }, null) ?? 9999;

    const bMinYear =
      b.versions.reduce<number | null>((acc, v) => {
        if (v.year == null) return acc;
        if (acc == null) return v.year;
        return Math.min(acc, v.year);
      }, null) ?? 9999;

    return aMinYear - bMinYear;
  });

  for (const song of songs) {
    song.versions.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  }

  return songs;
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

  const currentUser = await getCurrentUserFromApi().catch(() => null);
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  const canEdit = !!currentUser && allowedRoles.includes(currentUser.role as UserRole);
  const isAdmin = currentUser?.role === "ADMIN";

  const displayName =
    artist.firstName || artist.lastName
      ? `${artist.firstName ?? ""} ${artist.lastName ?? ""}`.trim() || artist.title
      : artist.title;

  const years =
    artist.bornYear || artist.dieYear
      ? `${artist.bornYear ?? "?"} – ${artist.dieYear ?? ""}`.trim()
      : "";

  const groupedSongs = groupRolesBySong(artist.roles || []);

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto", color: "#fff" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/artists" style={{ color: "#ccc", textDecoration: "none", fontSize: 14 }}>
          ← Πίσω στη λίστα καλλιτεχνών
        </Link>
      </div>

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

          {canEdit && (
            <div style={{ marginBottom: 8 }}>
              <Link
                href={`/artists/${artist.id}/edit`}
                style={{
                  fontSize: 13,
                  color: "#66c2ff",
                  textDecoration: "none",
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #333",
                  backgroundColor: "#111",
                  display: "inline-block",
                }}
              >
                ✎ Επεξεργασία καλλιτέχνη
              </Link>
            </div>
          )}

          {isAdmin && (
            <div style={{ marginBottom: 8 }}>
              <DeleteArtistButton artistId={artist.id} />
            </div>
          )}

          {years && <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>{years}</div>}

          {artist.title && artist.title !== displayName && (
            <div style={{ fontSize: 14, color: "#aaa", marginBottom: 8 }}>{artist.title}</div>
          )}

          {artist.sex && (
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 4 }}>
              Φύλο: {artist.sex}
            </div>
          )}

          {artist.wikiUrl && (
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
          )}
        </div>
      </div>

      {artist.biography && (
        <div style={{ marginBottom: 32, lineHeight: 1.6, fontSize: 15 }}>
          {artist.biography.split("\n").map((p, idx) => (
            <p key={idx} style={{ marginBottom: 8 }}>
              {p}
            </p>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 22, marginBottom: 12 }}>Συμμετοχές σε τραγούδια</h2>

      {groupedSongs.length === 0 ? (
        <p style={{ fontSize: 14, color: "#ccc" }}>
          Δεν υπάρχουν καταγεγραμμένες συμμετοχές για αυτόν τον καλλιτέχνη.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groupedSongs.map((song) => (
            <div
              key={song.songId}
              style={{
                borderRadius: 8,
                border: "1px solid #333",
                padding: "12px 12px 8px 12px",
                backgroundColor: "#111",
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <Link
                  href={`/songs/${song.songId}`}
                  style={{
                    color: "#fff",
                    textDecoration: "none",
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {song.songTitle}
                </Link>
              </div>

              {song.versions.map((v) => (
                <div
                  key={v.versionId}
                  style={{ marginLeft: 12, padding: "4px 0", fontSize: 14 }}
                >
                  <div style={{ marginBottom: 2 }}>
                    Έκδοση:{" "}
                    {v.versionTitle && v.versionTitle.trim().length > 0
                      ? v.versionTitle
                      : "Χωρίς τίτλο"}
                    {v.year && ` (${v.year})`}
                  </div>
                  <div style={{ fontSize: 13, color: "#ccc" }}>
                    Ρόλοι: {v.roles.map((r) => ROLE_LABELS[r] || r).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
