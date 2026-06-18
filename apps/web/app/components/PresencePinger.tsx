"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const HEARTBEAT_MS = 60_000;
const MIN_PING_GAP_MS = 25_000;

function browserOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function visibleTab() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export default function PresencePinger() {
  const { status } = useSession();
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") return;

    let stopped = false;

    async function ping(force = false) {
      if (stopped) return;
      if (!browserOnline()) return;
      if (!visibleTab() && !force) return;

      const now = Date.now();
      if (!force && now - lastPingAtRef.current < MIN_PING_GAP_MS) return;
      lastPingAtRef.current = now;

      try {
        await fetch("/api/presence/ping", {
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
