// apps/web/app/categories/[id]/edit/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { fetchJson } from "@/lib/api";
import { type UserRole } from "@/lib/currentUser";
import { requireUserRoleOrRedirect } from "@/lib/authz";

import PageSuspense from "@/app/components/PageSuspense";
import CategoryEditPageClient from "./CategoryEditPageClient";
import { type CategoryForEdit } from "../../CategoryForm";

type PageProps = {
  params: { id: string };
};

type CategoryDetailApi = {
  id: number;
  title: string;
  slug: string | null;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return { title: "Επεξεργασία κατηγορίας | Repertorio.net" };
  }

  try {
    const category = await fetchJson<CategoryDetailApi>(`/categories/${idNum}`);
    const baseTitle = category.title || "Κατηγορία";
    return {
      title: `Επεξεργασία: ${baseTitle} – Κατηγορίες | Repertorio.net`,
      description: `Επεξεργασία στοιχείων κατηγορίας ${baseTitle} στο Repertorio.net`,
    };
  } catch {
    return { title: "Επεξεργασία κατηγορίας | Repertorio.net" };
  }
}

export default async function CategoryEditPage({ params }: PageProps) {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  await requireUserRoleOrRedirect(allowedRoles, `/categories/${idNum}`);

  let catApi: CategoryDetailApi;
  try {
    catApi = await fetchJson<CategoryDetailApi>(`/categories/${idNum}`);
  } catch {
    notFound();
  }

  const categoryForEdit: CategoryForEdit = {
    id: catApi.id,
    title: catApi.title,
    slug: catApi.slug,
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
        <CategoryEditPageClient idNum={idNum} category={categoryForEdit} />
      </PageSuspense>
    </section>
  );
}
