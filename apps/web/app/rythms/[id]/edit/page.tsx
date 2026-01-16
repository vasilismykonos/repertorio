// apps/web/app/rythms/[id]/edit/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { fetchJson } from "@/lib/api";
import { type UserRole } from "@/lib/currentUser";
import { requireUserRoleOrRedirect } from "@/lib/authz";

import PageSuspense from "@/app/components/PageSuspense";
import RythmEditPageClient from "./RythmEditPageClient";
import { type RythmForEdit } from "../../RythmForm";

type PageProps = {
  params: { id: string };
};

type RythmDetailApi = {
  id: number;
  title: string;
  slug: string | null;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return { title: "Επεξεργασία ρυθμού | Repertorio.net" };
  }

  try {
    const rythm = await fetchJson<RythmDetailApi>(`/rythms/${idNum}`);
    const baseTitle = rythm.title || "Ρυθμός";
    return {
      title: `Επεξεργασία: ${baseTitle} – Ρυθμοί | Repertorio.net`,
      description: `Επεξεργασία στοιχείων ρυθμού ${baseTitle} στο Repertorio.net`,
    };
  } catch {
    return { title: "Επεξεργασία ρυθμού | Repertorio.net" };
  }
}

export default async function RythmEditPage({ params }: PageProps) {
  const idNum = Number.parseInt(params.id, 10);
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  const allowedRoles: UserRole[] = ["ADMIN", "EDITOR"];
  await requireUserRoleOrRedirect(allowedRoles, `/rythms/${idNum}`);

  let rythmApi: RythmDetailApi;
  try {
    rythmApi = await fetchJson<RythmDetailApi>(`/rythms/${idNum}`);
  } catch {
    notFound();
  }

  const rythmForEdit: RythmForEdit = {
    id: rythmApi.id,
    title: rythmApi.title ?? "",
    slug: rythmApi.slug,
  };

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <PageSuspense>
        <RythmEditPageClient idNum={idNum} rythm={rythmForEdit} />
      </PageSuspense>
    </section>
  );
}
