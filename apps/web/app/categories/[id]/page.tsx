// apps/web/app/categories/[id]/page.tsx
import { notFound } from "next/navigation";

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

import CategoryViewPageClient from "./CategoryViewPageClient";

type PageProps = {
  params: { id: string };
};

type CategoryDetailApi = {
  id: number;
  title: string;
  slug: string | null;     // ✅ required by CategoryViewPageClient
  songsCount: number;
};

export const dynamic = "force-dynamic";

export default async function CategoryViewPage({ params }: PageProps) {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  let category: CategoryDetailApi;
  try {
    category = await fetchJson<CategoryDetailApi>(`/categories/${idNum}`);
  } catch {
    notFound();
  }

  const currentUser = await getCurrentUserFromApi().catch(() => null);
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  const canEdit =
    !!currentUser && allowedRoles.includes(currentUser.role as UserRole);

  return (
    <CategoryViewPageClient
      idNum={idNum}
      category={category}
      canEdit={canEdit}
    />
  );
}
