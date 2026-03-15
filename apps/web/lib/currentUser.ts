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

type MeResponse = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: string | null;
  profile?: any | null;
  avatarUrl?: string | null;
  createdSongsCount: number;
  createdVersionsCount: number;
};

type AuthIdentity = {
  email: string | null;
  name?: string | null;
  image?: string | null;
};

export type CurrentUser = {
  id: number;
  email: string;
  role: UserRole;
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

async function getAuthIdentity(req?: NextRequest): Promise<AuthIdentity> {
  if (req) {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return { email: null, name: null, image: null };
    }

    const token = await getToken({ req, secret }).catch(() => null);

    return {
      email: (token?.email as string | undefined) ?? null,
      name: (token?.name as string | undefined) ?? null,
      image: (token?.picture as string | undefined) ?? null,
    };
  }

  const session = await getServerSession(authOptions).catch(() => null);

  return {
    email: session?.user?.email ?? null,
    name: session?.user?.name ?? null,
    image: session?.user?.image ?? null,
  };
}

async function fetchMe(email: string): Promise<MeResponse> {
  return fetchJson<MeResponse>("/users/me", {
    headers: {
      "x-user-email": email,
    },
  });
}

async function ensureUser(identity: AuthIdentity): Promise<void> {
  if (!identity.email) return;

  await fetchJson("/users/register-from-auth", {
    method: "POST",
    body: JSON.stringify({
      email: identity.email,
      name: identity.name ?? null,
      image: identity.image ?? null,
    }),
  });
}

export async function getCurrentUserFromApi(
  req?: NextRequest,
): Promise<CurrentUser | null> {
  const identity = await getAuthIdentity(req);

  if (!identity.email) {
    return null;
  }

  try {
    const me = await fetchMe(identity.email);

    if (!me?.email) return null;

    return {
      id: me.id,
      email: me.email,
      role: normalizeRole(me.role),
      username: me.username ?? null,
      displayName: me.displayName ?? null,
      avatarUrl: me.avatarUrl ?? null,
      profile: me.profile ?? null,
    };
  } catch {
    try {
      await ensureUser(identity);

      const me = await fetchMe(identity.email);

      if (!me?.email) return null;

      return {
        id: me.id,
        email: me.email,
        role: normalizeRole(me.role),
        username: me.username ?? null,
        displayName: me.displayName ?? null,
        avatarUrl: me.avatarUrl ?? null,
        profile: me.profile ?? null,
      };
    } catch {
      return null;
    }
  }
}