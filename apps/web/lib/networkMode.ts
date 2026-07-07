export type NetworkMode = "auto" | "offline";

export const NETWORK_MODE_STORAGE_KEY = "repertorio_network_mode";
export const NETWORK_MODE_CHANGED_EVENT = "repertorio:network-mode";

function isBrowser() {
  return typeof window !== "undefined";
}

function readCookieNetworkMode(): NetworkMode {
  if (!isBrowser()) return "auto";
  const cookie = `; ${document.cookie || ""}`;
  return cookie.includes(`; ${NETWORK_MODE_STORAGE_KEY}=offline`) ? "offline" : "auto";
}

export function normalizeNetworkMode(value: unknown): NetworkMode {
  return value === "offline" ? "offline" : "auto";
}

export function readNetworkMode(): NetworkMode {
  if (!isBrowser()) return "auto";
  const cookieMode = readCookieNetworkMode();
  try {
    const storedMode = normalizeNetworkMode(window.localStorage.getItem(NETWORK_MODE_STORAGE_KEY));
    return storedMode === "offline" || cookieMode === "offline" ? "offline" : "auto";
  } catch {
    return cookieMode;
  }
}

function writeStoredNetworkMode(mode: NetworkMode) {
  if (!isBrowser()) return;
  const next = normalizeNetworkMode(mode);
  try {
    window.localStorage.setItem(NETWORK_MODE_STORAGE_KEY, next);
  } catch {
    // Best-effort preference only.
  }
  try {
    document.cookie = `${NETWORK_MODE_STORAGE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Best-effort preference only.
  }
}

export function isForcedOfflineMode(): boolean {
  return readNetworkMode() === "offline";
}

export function notifyServiceWorkerNetworkMode(mode: NetworkMode = readNetworkMode()) {
  if (typeof navigator === "undefined") return;
  const message = { type: "NETWORK_MODE", mode };
  try {
    navigator.serviceWorker?.controller?.postMessage(message);
    void navigator.serviceWorker?.ready.then((registration) => {
      const worker = navigator.serviceWorker.controller || registration.active;
      worker?.postMessage(message);
    });
  } catch {
    // Best-effort; client fetches still respect the mode.
  }
}

export function requestServiceWorkerNetworkMode() {
  if (typeof navigator === "undefined") return;
  const message = { type: "NETWORK_MODE_GET" };
  try {
    navigator.serviceWorker?.controller?.postMessage(message);
    void navigator.serviceWorker?.ready.then((registration) => {
      const worker = navigator.serviceWorker.controller || registration.active;
      worker?.postMessage(message);
    });
  } catch {
    // Best-effort; stored preference is still available.
  }
}

export function setNetworkMode(mode: NetworkMode) {
  if (!isBrowser()) return;
  const next = normalizeNetworkMode(mode);
  writeStoredNetworkMode(next);
  notifyServiceWorkerNetworkMode(next);
  window.dispatchEvent(new CustomEvent(NETWORK_MODE_CHANGED_EVENT, { detail: { mode: next } }));
}

export function subscribeNetworkMode(listener: (mode: NetworkMode) => void): () => void {
  if (!isBrowser()) return () => {};

  const notify = () => {
    listener(readNetworkMode());
    notifyServiceWorkerNetworkMode();
  };

  const onServiceWorkerMessage = (event: MessageEvent) => {
    const data = event.data || {};
    if (data.type !== "NETWORK_MODE_STATE") return;
    const workerMode = normalizeNetworkMode(data.mode);
    const storedMode = readNetworkMode();
    if (workerMode !== storedMode) notifyServiceWorkerNetworkMode(storedMode);
    listener(storedMode);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === NETWORK_MODE_STORAGE_KEY) notify();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(NETWORK_MODE_CHANGED_EVENT, notify as EventListener);
  navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

  const storedMode = readNetworkMode();
  listener(storedMode);
  if (storedMode === "offline") notifyServiceWorkerNetworkMode(storedMode);
  requestServiceWorkerNetworkMode();

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(NETWORK_MODE_CHANGED_EVENT, notify as EventListener);
    navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
  };
}
