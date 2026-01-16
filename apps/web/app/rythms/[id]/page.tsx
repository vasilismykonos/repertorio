// apps/web/app/rythms/[id]/page.tsx
import ActionBar from "@/app/components/ActionBar";
import { LinkButton } from "@/app/components/buttons";
import { notFound } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

type PageProps = {
  params: { id: string };
};

type RythmDetailApi = {
  id: number;
  title: string;
  slug: string | null; // μπορεί να μείνει, απλά δεν το εμφανίζουμε
  songsCount: number;
};

export const dynamic = "force-dynamic";

export default async function RythmViewPage({ params }: PageProps) {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  let rythm: RythmDetailApi;
  try {
    rythm = await fetchJson<RythmDetailApi>(`/rythms/${idNum}`);
  } catch {
    notFound();
  }

  const currentUser = await getCurrentUserFromApi().catch(() => null);
  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  const canEdit =
    !!currentUser && allowedRoles.includes(currentUser.role as UserRole);

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        right={
          canEdit ? (
            <LinkButton
              href={`/rythms/${idNum}/edit`}
              variant="secondary"
              title="Επεξεργασία ρυθμού"
              action="edit"
            >
              Επεξεργασία
            </LinkButton>
          ) : null
        }
      />

      <h1 style={{ fontSize: 28, marginBottom: 16 }}>{rythm.title}</h1>

      {/* ❌ Δεν εμφανίζουμε slug στην προβολή */}

      <p style={{ marginBottom: 8 }}>
        <strong>Τραγούδια:</strong> {rythm.songsCount}
      </p>
    </section>
  );
}
