// apps/web/app/artists/[id]/edit/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchJson } from "@/lib/api";
import ArtistEditForm, { type ArtistForEdit } from "./ArtistEditForm";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

type PageProps = {
  params: { id: string };
};

type ArtistDetailApi = {
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
  // roles δεν τα χρειάζεται το edit form
};

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: PageProps,
): Promise<Metadata> {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return {
      title: "Επεξεργασία καλλιτέχνη | Repertorio.net",
    };
  }

  try {
    const artist = await fetchJson<ArtistDetailApi>(`/artists/${idNum}`);
    const baseTitle = artist.title || "Καλλιτέχνης";
    return {
      title: `Επεξεργασία: ${baseTitle} – Καλλιτέχνες | Repertorio.net`,
      description: `Επεξεργασία στοιχείων καλλιτέχνη ${baseTitle} στο Repertorio.net`,
    };
  } catch {
    return {
      title: "Επεξεργασία καλλιτέχνη | Repertorio.net",
    };
  }
}

export default async function ArtistEditPage({ params }: PageProps) {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    notFound();
  }

  // Έλεγχος χρήστη (όπως κάνεις στα songs)
  const currentUser = await getCurrentUserFromApi().catch(() => null);

  if (!currentUser) {
    // αν δεν είναι συνδεδεμένος, στείλτον στο login ή στο προφίλ του καλλιτέχνη
    redirect(`/artists/${idNum}`);
  }

  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  if (!allowedRoles.includes(currentUser.role as UserRole)) {
    // Δεν έχει δικαίωμα -> πίσω στο view
    redirect(`/artists/${idNum}`);
  }

  let artistApi: ArtistDetailApi;
  try {
    artistApi = await fetchJson<ArtistDetailApi>(`/artists/${idNum}`);
  } catch (err) {
    notFound();
  }

  const artistForEdit: ArtistForEdit = {
    id: artistApi.id,
    title: artistApi.title,
    firstName: artistApi.firstName,
    lastName: artistApi.lastName,
    sex: artistApi.sex,
    bornYear: artistApi.bornYear,
    dieYear: artistApi.dieYear,
    imageUrl: artistApi.imageUrl,
    biography: artistApi.biography,
    wikiUrl: artistApi.wikiUrl,
  };

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 900,
        margin: "0 auto",
        color: "#fff",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Link
          href={`/artists/${idNum}`}
          style={{ color: "#ccc", textDecoration: "none", fontSize: 14 }}
        >
          ← Πίσω στο προφίλ καλλιτέχνη
        </Link>
      </div>

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>
        Επεξεργασία καλλιτέχνη
      </h1>

      <ArtistEditForm artist={artistForEdit} />
    </section>
  );
}

