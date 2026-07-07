export type ViewMode = "auto" | "mobile" | "desktop";

export const VIEW_MODE_STORAGE_KEY = "repertorio_view_mode";
export const VIEW_MODE_CHANGED_EVENT = "repertorio:view-mode";

const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1";
const DESKTOP_VIEWPORT = "width=1180, initial-scale=1";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function normalizeViewMode(value: unknown): ViewMode {
  return value === "mobile" || value === "desktop" ? value : "auto";
}

export function readViewMode(): ViewMode {
  if (!isBrowser()) return "auto";
  try {
    return normalizeViewMode(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

function viewportMeta(): HTMLMetaElement | null {
  if (!isBrowser()) return null;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  return meta;
}

export function applyViewMode(mode: ViewMode = readViewMode()) {
  if (!isBrowser()) return;
  const next = normalizeViewMode(mode);
  const root = document.documentElement;
  root.dataset.viewMode = next;
  root.classList.toggle("rp-force-mobile", next === "mobile");
  root.classList.toggle("rp-force-desktop", next === "desktop");
  viewportMeta()?.setAttribute("content", next === "desktop" ? DESKTOP_VIEWPORT : DEFAULT_VIEWPORT);
}

export function setViewMode(mode: ViewMode) {
  if (!isBrowser()) return;
  const next = normalizeViewMode(mode);
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
  } catch {
    // Best-effort device preference only.
  }
  applyViewMode(next);
  window.dispatchEvent(new CustomEvent(VIEW_MODE_CHANGED_EVENT, { detail: { mode: next } }));
}

export function subscribeViewMode(listener: (mode: ViewMode) => void): () => void {
  if (!isBrowser()) return () => {};

  const notify = () => {
    const mode = readViewMode();
    applyViewMode(mode);
    listener(mode);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === VIEW_MODE_STORAGE_KEY) notify();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(VIEW_MODE_CHANGED_EVENT, notify as EventListener);
  notify();

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(VIEW_MODE_CHANGED_EVENT, notify as EventListener);
  };
}
