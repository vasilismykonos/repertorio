"use client";

import { useEffect } from "react";

export function PwaProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log(
            "[PWA] Service worker registered with scope:",
            registration.scope
          );
        })
        .catch((error) => {
          console.error("[PWA] Service worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
