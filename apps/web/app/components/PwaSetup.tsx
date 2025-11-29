"use client";

import { useEffect } from "react";

export function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((err) => {
            console.error("SW registration failed:", err);
          });
      });
    }
  }, []);

  return null; // δεν εμφανίζει κάτι, απλά τρέχει το effect
}
