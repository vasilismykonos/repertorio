"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { readOfflineCurrentUser, type OfflineCurrentUser } from "./offlineStore";
import { isForcedOfflineMode, NETWORK_MODE_CHANGED_EVENT, subscribeNetworkMode } from "./networkMode";

type AuthStatus = "authenticated" | "unauthenticated" | "loading";

function browserOnline() {
  if (isForcedOfflineMode()) return false;
  return typeof navigator === "undefined" || typeof navigator.onLine === "undefined"
    ? true
    : navigator.onLine;
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function useOfflineIdentity() {
  const { data: session, status } = useSession();
  const [offlineUser, setOfflineUser] = useState<OfflineCurrentUser | null>(null);
  const [offlineChecked, setOfflineChecked] = useState(false);
  const [online, setOnline] = useState<boolean>(() => browserOnline());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const user = await readOfflineCurrentUser().catch(() => null);
      if (!cancelled) {
        setOfflineUser(user);
        setOfflineChecked(true);
      }
    };

    void load();

    const onNetworkChange = () => {
      setOnline(browserOnline());
      void load();
    };

    window.addEventListener("online", onNetworkChange);
    window.addEventListener("offline", onNetworkChange);
    window.addEventListener(NETWORK_MODE_CHANGED_EVENT, onNetworkChange);
    const unsubscribeNetworkMode = subscribeNetworkMode(() => {
      setOnline(browserOnline());
      void load();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("online", onNetworkChange);
      window.removeEventListener("offline", onNetworkChange);
      window.removeEventListener(NETWORK_MODE_CHANGED_EVENT, onNetworkChange);
      unsubscribeNetworkMode();
    };
  }, []);

  return useMemo(() => {
    const sessionUser = (session?.user || null) as any;
    const sessionEmail = normalizeEmail(sessionUser?.email);
    const offlineEmail = normalizeEmail(offlineUser?.email);
    const hasSessionUser = status === "authenticated" && Boolean(sessionUser);
    const canUseOfflineUser = !online && !hasSessionUser && Boolean(offlineUser?.id && offlineEmail);

    const effectiveStatus: AuthStatus = hasSessionUser
      ? "authenticated"
      : canUseOfflineUser
        ? "authenticated"
        : status === "loading" || !offlineChecked
          ? "loading"
          : "unauthenticated";

    const effectiveUser = hasSessionUser
      ? sessionUser
      : canUseOfflineUser
        ? {
            id: offlineUser?.id,
            email: offlineUser?.email,
            name: offlineUser?.displayName || offlineUser?.username || offlineUser?.email,
            image: offlineUser?.avatarUrl || undefined,
            role: offlineUser?.role || undefined,
            displayName: offlineUser?.displayName || undefined,
          }
        : null;

    return {
      session,
      status: effectiveStatus,
      isAuthenticated: effectiveStatus === "authenticated",
      isOfflineAuthenticated: canUseOfflineUser,
      online,
      offlineUser,
      user: effectiveUser,
      userId: Number(effectiveUser?.id || offlineUser?.id || 0) || null,
      userEmail: normalizeEmail(effectiveUser?.email || sessionEmail || offlineEmail) || undefined,
      userName: String(effectiveUser?.displayName || effectiveUser?.name || effectiveUser?.email || "").trim() || undefined,
      userImage: String(effectiveUser?.image || effectiveUser?.picture || "").trim() || undefined,
      userRole: String(effectiveUser?.role || offlineUser?.role || "").trim() || undefined,
    };
  }, [offlineChecked, offlineUser, online, session, status]);
}
