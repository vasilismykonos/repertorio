"use client";

import { useEffect } from "react";
import { APP_VERSION } from "@/lib/appVersion";

const PAGE_SHELL_URLS = ["/", "/songs", "/lists", "/songs/offline-shell?offlineShell=1", "/lists/offline-shell?offlineShell=1"];
const APP_VERSION_STORAGE_KEY = "repertorio_app_version";
const CACHE_PREFIXES = ["repertorio-static-", "repertorio-pages-"];
const PWA_WARMUP_DELAY_MS = 45 * 1000;
const PWA_WARMUP_IDLE_TIMEOUT_MS = 10 * 1000;

async function clearOldAppCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const names = await window.caches.keys();
  await Promise.all(
    names
      .filter((name) => CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
      .map((name) => window.caches.delete(name)),
  );
}

function warmPageShells(registration: ServiceWorkerRegistration) {
  const post = (worker?: ServiceWorker | null) => {
    worker?.postMessage({ type: "CACHE_PAGES", urls: PAGE_SHELL_URLS });
  };

  post(navigator.serviceWorker.controller || registration.active || registration.waiting || registration.installing);

  navigator.serviceWorker.ready
    .then((readyRegistration) => {
      post(navigator.serviceWorker.controller || readyRegistration.active);
    })
    .catch(() => {
      // Best-effort cache warmup only.
    });
}

function schedulePwaWarmup(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let idleId: number | null = null;
  const timeoutId = window.setTimeout(() => {
    const run = () => {
      if (document.visibilityState === "hidden") return;
      callback();
    };

    const requestIdle = (window as any).requestIdleCallback;
    if (typeof requestIdle === "function") {
      idleId = requestIdle(run, { timeout: PWA_WARMUP_IDLE_TIMEOUT_MS });
      return;
    }

    run();
  }, PWA_WARMUP_DELAY_MS);

  return () => {
    window.clearTimeout(timeoutId);
    const cancelIdle = (window as any).cancelIdleCallback;
    if (idleId !== null && typeof cancelIdle === "function") cancelIdle(idleId);
  };
}

export function PwaProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedVersion = window.localStorage.getItem(APP_VERSION_STORAGE_KEY);
      if (storedVersion && storedVersion !== APP_VERSION) {
        window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION);
        void clearOldAppCaches().finally(() => window.location.reload());
        return;
      }
      if (!storedVersion) window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION);
    } catch {
      // Version tracking is best-effort; service worker update still runs below.
    }

    if ("serviceWorker" in navigator) {
      let reloading = false;
      let disposed = false;
      let cancelWarmup = () => {};

      const onControllerChange = () => {
        if (reloading) return;
        reloading = true;

        window.location.reload();
      };

      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          if (disposed) return;

          console.log(
            "[PWA] Service worker registered with scope:",
            registration.scope
          );
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                worker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
          cancelWarmup = schedulePwaWarmup(() => warmPageShells(registration));
          void registration.update().catch(() => null);
        })
        .catch((error) => {
          console.error("[PWA] Service worker registration failed:", error);
        });

      return () => {
        disposed = true;
        cancelWarmup();
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }
  }, []);

  return null;
}
