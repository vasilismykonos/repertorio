// apps/web/app/rythms/new/page.tsx
import { type UserRole } from "@/lib/currentUser";
import PageSuspense from "@/app/components/PageSuspense";
import NewRythmPageClient from "./NewRythmPageClient";
import { requireUserRoleOrRedirect } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function NewRythmPage() {
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  await requireUserRoleOrRedirect(allowedRoles, "/rythms");

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
        <NewRythmPageClient />
      </PageSuspense>
    </section>
  );
}