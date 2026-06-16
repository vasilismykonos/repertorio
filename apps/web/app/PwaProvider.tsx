"use client";

import { useEffect } from "react";
import { APP_VERSION } from "@/lib/appVersion";

const PAGE_SHELL_URLS = ["/", "/songs", "/lists", "/songs/offline-shell?offlineShell=1", "/lists/offline-shell?offlineShell=1"];
const APP_VERSION_STORAGE_KEY = "repertorio_app_version";
const CACHE_PREFIXES = ["repertorio-static-", "repertorio-pages-"];
const PWA_INITIAL_SHELL_WARMUP_DELAY_MS = 5 * 1000;
const PWA_WARMUP_DELAY_MS = 120 * 1000;
const PWA_WARMUP_IDLE_TIMEOUT_MS = 15 * 1000;
const PWA_WARMUP_RETRY_DELAY_MS = 30 * 1000;
const PWA_USER_IDLE_GRACE_MS = 25 * 1000;

let lastPwaActivityAt = Date.now();

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

function markPwaActivity() {
  lastPwaActivityAt = Date.now();
}

function pwaUserIsIdle() {
  if (typeof window === "undefined") return false;
  if (document.visibilityState === "hidden") return false;
  return Date.now() - lastPwaActivityAt >= PWA_USER_IDLE_GRACE_MS;
}

function installPwaActivityTracking(): () => void {
  if (typeof window === "undefined") return () => {};
  markPwaActivity();
  const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
  events.forEach((eventName) => window.addEventListener(eventName, markPwaActivity, { passive: true }));
  return () => {
    events.forEach((eventName) => window.removeEventListener(eventName, markPwaActivity));
  };
}

function shouldWarmPwaShells() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as any).connection;
  return !connection?.saveData;
}

function scheduleInitialPageShellWarmup(registration: ServiceWorkerRegistration): () => void {
  if (typeof window === "undefined") return () => {};

  const timeoutId = window.setTimeout(() => {
    if (document.visibilityState === "hidden") return;
    if (!shouldWarmPwaShells()) return;
    warmPageShells(registration);
  }, PWA_INITIAL_SHELL_WARMUP_DELAY_MS);

  return () => window.clearTimeout(timeoutId);
}

function schedulePwaWarmup(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;

  const clearPending = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = null;
    const cancelIdle = (window as any).cancelIdleCallback;
    if (idleId !== null && typeof cancelIdle === "function") cancelIdle(idleId);
    idleId = null;
  };

  const schedule = (delayMs: number) => {
    clearPending();
    timeoutId = window.setTimeout(() => {
      const run = () => {
        if (cancelled || document.visibilityState === "hidden") return;
        if (!shouldWarmPwaShells()) return;
        if (!pwaUserIsIdle()) {
          schedule(PWA_WARMUP_RETRY_DELAY_MS);
          return;
        }
        callback();
      };

      const requestIdle = (window as any).requestIdleCallback;
      if (typeof requestIdle === "function") {
        idleId = requestIdle(run, { timeout: PWA_WARMUP_IDLE_TIMEOUT_MS });
        return;
      }

      run();
    }, delayMs);
  };

  schedule(PWA_WARMUP_DELAY_MS);

  return () => {
    cancelled = true;
    clearPending();
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
      let cancelInitialWarmup = () => {};
      const removeActivityTracking = installPwaActivityTracking();

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
          cancelInitialWarmup = scheduleInitialPageShellWarmup(registration);
          cancelWarmup = schedulePwaWarmup(() => warmPageShells(registration));
          void registration.update().catch(() => null);
        })
        .catch((error) => {
          console.error("[PWA] Service worker registration failed:", error);
        });

      return () => {
        disposed = true;
        removeActivityTracking();
        cancelInitialWarmup();
        cancelWarmup();
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }
  }, []);

  return null;
}
