import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";
import MePageClient from "./MePageClient";

export const metadata: Metadata = {
  title: "Ο λογαριασμός μου | Repertorio Next",
};

type UserDetail = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
  avatarUrl?: string | null;

  // ✅ NEW
  profile?: any | null;
};

async function fetchUser(id: number): Promise<UserDetail> {
  return fetchJson<UserDetail>(`/users/${id}`);
}

export default async function MePage() {
  const currentUser = await getCurrentUserFromApi();

  if (!currentUser) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/me")}`);
  }

  const user = await fetchUser(currentUser.id);

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <MePageClient
        user={{
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: (user as any).avatarUrl ?? null,

          // ✅ NEW
          profile: (user as any).profile ?? null,
        }}
      />
    </section>
  );
}
