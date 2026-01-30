// apps/web/app/users/[id]/edit/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";
import UserEditPageClient from "./UserEditPageClient";

type UserDetail = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  createdSongsCount: number;
  createdVersionsCount: number;
};

export const metadata: Metadata = {
  title: "Επεξεργασία χρήστη | Repertorio Next",
};

async function fetchUser(id: number): Promise<UserDetail> {
  return fetchJson<UserDetail>(`/users/${id}`);
}

export default async function UserEditPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid user id");

  const [user, currentUser] = await Promise.all([fetchUser(id), getCurrentUserFromApi()]);

  const isAdmin = currentUser?.role === "ADMIN";
  const isSelf = currentUser && currentUser.id === user.id;
  const canEdit = isAdmin || isSelf;

  if (!canEdit) redirect("/users");

  const canEditRole = isAdmin;

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <UserEditPageClient
        user={{
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        }}
        canEditRole={canEditRole}
      />
    </section>
  );
}
