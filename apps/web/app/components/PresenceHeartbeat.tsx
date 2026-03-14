"use client";

import { useEffect } from "react";

const API_BASE = "/api/v1";

export default function PresenceHeartbeat() {
  useEffect(() => {
    let stopped = false;

    const ping = async () => {
      try {
        await fetch(`${API_BASE}/presence/ping`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // ignore
      }
    };

    // 1) immediate
    void ping();

    // 2) interval κάθε 45s
    const id = window.setInterval(() => {
      if (!stopped) void ping();
    }, 45_000);

    // 3) όταν ξαναγυρνάει το tab
    const onVis = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}