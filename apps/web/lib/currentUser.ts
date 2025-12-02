// apps/web/lib/currentUser.ts

import { getServerSession } from "next-auth";
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
  // Το role έρχεται από το Nest API σαν string (π.χ. "ADMIN")
  role: string | null;
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
};

/**
 * Επιστρέφει τον τρέχοντα χρήστη από το Nest API,
 * με βάση το email του Google session (NextAuth).
 *
 * - Παίρνουμε το email από το session
 * - Καλούμε /users?search=<email>&page=1&pageSize=5
 * - Βρίσκουμε τον χρήστη με ακριβές email (case-insensitive)
 * - Κανονικοποιούμε το role σε UserRole ("ADMIN" | "EDITOR" | ...)
 */
export async function getCurrentUserFromApi(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);

  const email = session?.user?.email;
  if (!email) {
    return null;
  }

  const search = encodeURIComponent(email);

  const data = await fetchJson<UsersResponse>(
    `/users?search=${search}&page=1&pageSize=5`
  );

  const lower = email.toLowerCase();

  const match = data.items.find(
    (u) => (u.email ?? "").toLowerCase() === lower
  );

  if (!match || !match.email) {
    return null;
  }

  // Κανονικοποίηση του role σε UserRole
  const rawRole = (match.role ?? "USER").toString().toUpperCase();

  const allowedRoles: UserRole[] = [
    "ADMIN",
    "EDITOR",
    "AUTHOR",
    "CONTRIBUTOR",
    "SUBSCRIBER",
    "USER",
  ];

  const normalizedRole: UserRole =
    (allowedRoles.find((r) => r === rawRole) as UserRole) || "USER";

  return {
    id: match.id,
    email: match.email,
    role: normalizedRole,
  };
}
