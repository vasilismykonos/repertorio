"use client";

import { useEffect } from "react";

export default function PresencePinger() {
  useEffect(() => {
    let alive = true;

    async function ping() {
      try {
        await fetch("/api/presence/ping", {
          method: "POST",
          // keepalive βοηθάει σε close tab / navigation
          keepalive: true,
          cache: "no-store",
        });
      } catch {}
    }

    // άμεσο ping
    ping();

    // κάθε 60s (διάλεξε ότι θες)
    const t = setInterval(() => {
      if (!alive) return;
      ping();
    }, 60_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return null;
}