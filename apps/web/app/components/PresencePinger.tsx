"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const HEARTBEAT_MS = 60_000;
const MIN_PING_GAP_MS = 25_000;
const GUEST_ID_KEY = "rep_presence_guest_id";

function browserOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function visibleTab() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function getGuestId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing && existing.trim()) return existing.trim();

    const randomPart =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const value = `guest_${randomPart}`;
    window.localStorage.setItem(GUEST_ID_KEY, value);
    return value;
  } catch {
    return null;
  }
}

export default function PresencePinger() {
  const { status } = useSession();
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status === "loading") return;

    let stopped = false;

    async function ping(force = false) {
      if (stopped) return;
      if (!browserOnline()) return;
      if (!visibleTab() && !force) return;

      const now = Date.now();
      if (!force && now - lastPingAtRef.current < MIN_PING_GAP_MS) return;
      lastPingAtRef.current = now;

      try {
        const guestId = status === "authenticated" ? null : getGuestId();
        const url = guestId
          ? `/api/presence/ping?guestId=${encodeURIComponent(guestId)}&guestLabel=${encodeURIComponent("Επισκέπτης")}`
          : "/api/presence/ping";

        await fetch(url, {
          method: "POST",
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Presence is best-effort and must never affect navigation.
      }
    }

    void ping(true);

    const intervalId = window.setInterval(() => {
      void ping(false);
    }, HEARTBEAT_MS);

    const onVisible = () => {
      if (visibleTab()) void ping(true);
    };
    const onOnline = () => {
      void ping(true);
    };
    const onPageHide = () => {
      void ping(true);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [status]);

  return null;
}
