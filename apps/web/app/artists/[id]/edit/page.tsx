// apps/web/app/artists/[id]/edit/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { type UserRole } from "@/lib/currentUser";
import { requireUserRoleOrRedirect } from "@/lib/authz";
import PageSuspense from "@/app/components/PageSuspense";
import ArtistEditPageClient from "./ArtistEditPageClient";
import { type ArtistForEdit } from "../../ArtistForm";

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
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  // Require appropriate user role. If the user is not authorised, they
  // will be redirected back to the artist profile page.
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  await requireUserRoleOrRedirect(allowedRoles, `/artists/${idNum}`);

  let artistApi: ArtistDetailApi;
  try {
    artistApi = await fetchJson<ArtistDetailApi>(`/artists/${idNum}`);
  } catch {
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
      <PageSuspense>
        <ArtistEditPageClient idNum={idNum} artist={artistForEdit} />
      </PageSuspense>
    </section>
  );
}

