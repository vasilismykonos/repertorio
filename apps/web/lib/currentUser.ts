// apps/web/lib/currentUser.ts

import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";

import { authOptions } from "./auth";
import { fetchJson } from "./api";

export type UserRole =
  | "ADMIN"
  | "EDITOR"
  | "AUTHOR"
  | "CONTRIBUTOR"
  | "SUBSCRIBER"
  | "USER";

type UserListItem = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: string | null;

  // ✅ important: the API already selects profile in users.service.ts
  profile?: any | null;

  // optional (if your API returns them)
  avatarUrl?: string | null;

  createdSongsCount: number;
  createdVersionsCount: number;
};

type UsersResponse = {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CurrentUser = {
  id: number;
  email: string;
  role: UserRole;

  // ✅ NEW: so Song pages can read prefs
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profile?: any | null;
};

function normalizeRole(raw: unknown): UserRole {
  const rawRole = (raw ?? "USER").toString().toUpperCase();

  const allowedRoles: UserRole[] = [
    "ADMIN",
    "EDITOR",
    "AUTHOR",
    "CONTRIBUTOR",
    "SUBSCRIBER",
    "USER",
  ];

  return (allowedRoles.find((r) => r === rawRole) as UserRole) || "USER";
}

/**
 * Επιστρέφει τον τρέχοντα χρήστη από το Nest API, με βάση email από NextAuth.
 *
 * - Route Handler: δίνεις req και παίρνουμε email από JWT token (getToken),
 *   επειδή βλέπει τα cookies του req.
 * - Server Component / Server Action: χωρίς req, χρησιμοποιούμε getServerSession.
 *
 * ✅ Επιστρέφει πλέον και profile ώστε να δουλεύουν τα prefs (song toggles defaults).
 */
export async function getCurrentUserFromApi(
  req?: NextRequest,
): Promise<CurrentUser | null> {
  let email: string | null = null;

  if (req) {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;

    const token = await getToken({ req, secret }).catch(() => null);
    email = (token?.email as string | undefined) || null;
  } else {
    const session = await getServerSession(authOptions).catch(() => null);
    email = session?.user?.email ?? null;
  }

  if (!email) return null;

  const search = encodeURIComponent(email);

  const data = await fetchJson<UsersResponse>(
    `/users?search=${search}&page=1&pageSize=5`,
  );

  const lower = email.toLowerCase();
  const match = data.items.find((u) => (u.email ?? "").toLowerCase() === lower);

  if (!match?.email) return null;

  return {
    id: match.id,
    email: match.email,
    role: normalizeRole(match.role),

    username: match.username ?? null,
    displayName: match.displayName ?? null,
    avatarUrl: (match as any).avatarUrl ?? null,
    profile: (match as any).profile ?? null,
  };
}
