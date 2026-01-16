// apps/web/app/artists/new/page.tsx
import type { UserRole } from "@/lib/currentUser";
import { requireUserRoleOrRedirect } from "@/lib/authz";
import PageSuspense from "@/app/components/PageSuspense";
import NewArtistPageClient from "./NewArtistPageClient";

export const dynamic = "force-dynamic";

export default async function NewArtistPage() {
  // Require appropriate user role. If the user is not authorised they will
  // be redirected back to the artists list.
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  await requireUserRoleOrRedirect(allowedRoles, "/artists");

  return (
    <section
      style={{
        padding: "24px 16px",
        maxWidth: 920,
        margin: "0 auto",
        color: "#fff",
      }}
    >
      <PageSuspense>
        <NewArtistPageClient />
      </PageSuspense>
    </section>
  );
}
