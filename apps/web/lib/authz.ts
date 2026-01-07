// apps/web/lib/authz.ts
import { redirect } from "next/navigation";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

/**
 * Enforces that the current user exists and has one of the allowed roles.
 * If not, redirects to the given path.
 *
 * Designed for Server Components / route-level guards.
 */
export async function requireUserRoleOrRedirect(
  allowedRoles: UserRole[],
  redirectTo: string,
): Promise<void> {
  const currentUser = await getCurrentUserFromApi().catch(() => null);

  if (!currentUser) {
    redirect(redirectTo);
  }

  const role = currentUser.role as UserRole;
  if (!allowedRoles.includes(role)) {
    redirect(redirectTo);
  }
}
