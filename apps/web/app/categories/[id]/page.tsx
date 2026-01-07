// apps/web/app/categories/[id]/page.tsx
import ActionBar from "@/app/components/ActionBar";
import LinkButton from "@/app/components/LinkButton";
import { notFound } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

type PageProps = {
  params: { id: string };
};

type CategoryDetailApi = {
  id: number;
  title: string;
  slug: string | null;
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
  const canEdit = !!currentUser && allowedRoles.includes(currentUser.role as UserRole);

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        right={
          canEdit ? (
            <LinkButton
              href={`/categories/${idNum}/edit`}
              variant="secondary"
              title="Επεξεργασία κατηγορίας"
            >
              Επεξεργασία
            </LinkButton>
          ) : null
        }
      />

      <h1 style={{ fontSize: 28, marginBottom: 16 }}>{category.title}</h1>

      <p style={{ marginBottom: 8 }}>
        <strong>Slug:</strong> {category.slug || "(auto)"}
      </p>

      <p style={{ marginBottom: 8 }}>
        <strong>Τραγούδια:</strong> {category.songsCount}
      </p>
    </section>
  );
}
