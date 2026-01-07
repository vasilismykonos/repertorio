// apps/web/app/categories/new/page.tsx
import { type UserRole } from "@/lib/currentUser";
import PageSuspense from "@/app/components/PageSuspense";
import NewCategoryPageClient from "./NewCategoryPageClient";
import { requireUserRoleOrRedirect } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  await requireUserRoleOrRedirect(allowedRoles, "/categories");

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
        <NewCategoryPageClient />
      </PageSuspense>
    </section>
  );
}
