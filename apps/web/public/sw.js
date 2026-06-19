const APP_VERSION = "3.0.45";
const VERSION = `repertorio-${APP_VERSION}`;
const STATIC_CACHE = `repertorio-static-${VERSION}`;
const PAGE_CACHE = `repertorio-pages-${VERSION}`;
const CACHE_PREFIXES = ["repertorio-static-", "repertorio-pages-"];
const PAGE_PATHS = new Set(["/", "/songs", "/lists"]);
const SONG_DETAIL_SHELL_PATH = "/songs/offline-shell";
const LIST_DETAIL_SHELL_PATH = "/lists/offline-shell";
const WARM_PAGE_URLS = [
  "/",
  "/songs",
  "/lists",
  `${SONG_DETAIL_SHELL_PATH}?offlineShell=1`,
  `${LIST_DETAIL_SHELL_PATH}?offlineShell=1`,
];
const AUTOMATIC_PAGE_SHELL_WARMUP_DELAY_MS = 5 * 1000;

let automaticPageShellWarmupStarted = false;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await cachePages(WARM_PAGE_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          const ours = CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
          const current = name === STATIC_CACHE || name === PAGE_CACHE;
          return ours && !current ? caches.delete(name) : Promise.resolve(false);
        }),
      );
      await self.clients.claim();
      await reloadWindowClients();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type !== "CACHE_PAGES") return;
  const urls = Array.isArray(data.urls) ? data.urls : [];
  event.waitUntil(cachePages(urls));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (isStaticRequest(request, url)) {
    event.respondWith(networkFirstAsset(request, url));
    return;
  }

  if (isPageRequest(request, url)) {
    event.respondWith(networkFirstPage(request, url));
    event.waitUntil(scheduleAutomaticPageShellWarmup());
  }
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleAutomaticPageShellWarmup() {
  if (automaticPageShellWarmupStarted) return;
  automaticPageShellWarmupStarted = true;
  await delay(AUTOMATIC_PAGE_SHELL_WARMUP_DELAY_MS);
  await cachePages(WARM_PAGE_URLS);
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/v1/") || url.pathname.startsWith("/rooms-api/");
}

function isStaticRequest(request, url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/images/")) return true;
  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.ico") return true;
  return ["script", "style", "font", "image", "manifest"].includes(request.destination);
}

function isSongDetailPath(pathname) {
  return /^\/songs\/\d+$/.test(pathname);
}

function isListDetailPath(pathname) {
  return /^\/lists\/\d+$/.test(pathname);
}

function isDetailShellPath(pathname) {
  return pathname === SONG_DETAIL_SHELL_PATH || pathname === LIST_DETAIL_SHELL_PATH;
}

function isOfflinePagePath(pathname) {
  return PAGE_PATHS.has(pathname) || isSongDetailPath(pathname) || isListDetailPath(pathname) || isDetailShellPath(pathname);
}

function isPageRequest(request, url) {
  if (!isOfflinePagePath(url.pathname)) return false;
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function normalizedPageRequest(url) {
  const normalizedUrl = new URL(url.origin + url.pathname);
  return new Request(normalizedUrl.toString(), {
    method: "GET",
    headers: { Accept: "text/html" },
  });
}

function shellPathFor(url) {
  if (isSongDetailPath(url.pathname) && url.pathname !== SONG_DETAIL_SHELL_PATH) return SONG_DETAIL_SHELL_PATH;
  if (isListDetailPath(url.pathname) && url.pathname !== LIST_DETAIL_SHELL_PATH) return LIST_DETAIL_SHELL_PATH;
  return null;
}

async function matchDetailShell(cache, url) {
  const shellPath = shellPathFor(url);
  if (!shellPath) return null;
  return cache.match(normalizedPageRequest(new URL(self.location.origin + shellPath)));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const url = new URL(request.url);
  const ignoreSearch = url.pathname.startsWith("/_next/static/");
  const cached = await cache.match(request, { ignoreSearch });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => null);
  }
  return response;
}

async function networkFirstAsset(request, url) {
  const cache = await caches.open(STATIC_CACHE);
  const ignoreSearch = url.pathname.startsWith("/_next/static/");
  const cached = await cache.match(request, { ignoreSearch });

  try {
    const networkRequest = url.pathname.startsWith("/_next/static/")
      ? new Request(request, { cache: "reload" })
      : request;
    const response = await fetch(networkRequest);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (cached) return cached;
    throw new Error(`Asset unavailable offline: ${url.pathname}`);
  }
}

async function networkFirstPage(request, url) {
  const cache = await caches.open(PAGE_CACHE);
  const key = normalizedPageRequest(url);

  try {
    const response = await fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (response && response.ok && contentType.includes("text/html")) {
      await cache.put(key, response.clone());
      cacheAssetsFromHtml(response.clone(), url).catch(() => null);
    }
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;

    const detailShell = await matchDetailShell(cache, url);
    if (detailShell) return detailShell;

    const home = await cache.match(normalizedPageRequest(new URL(self.location.origin + "/")));
    if (home) return home;

    return offlineFallbackResponse(url);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function offlineFallbackResponse(url) {
  const retryHref = escapeHtml(url.pathname + url.search);
  const html = `<!doctype html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Repertorio offline</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; padding: 24px; color: #111; background: #fff; }
    main { max-width: 520px; margin: 12vh auto 0; }
    h1 { font-size: 24px; line-height: 1.25; margin: 0 0 12px; }
    p { font-size: 16px; line-height: 1.5; color: #555; }
    a { color: #0f5bd5; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Δεν υπάρχει διαθέσιμη offline σελίδα</h1>
    <p>Άνοιξε μία φορά την εφαρμογή όταν υπάρχει internet και περίμενε να ολοκληρωθεί ο offline συγχρονισμός.</p>
    <p><a href="${retryHref}">Δοκιμή ξανά</a></p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function isCacheableAssetUrl(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico"
  );
}

async function cacheAssetUrl(assetCache, url) {
  if (!isCacheableAssetUrl(url)) return;
  const request = new Request(url.toString(), { method: "GET", credentials: "include", cache: "reload" });
  const ignoreSearch = url.pathname.startsWith("/_next/static/");
  const cached = await assetCache.match(request, { ignoreSearch });
  if (cached) return;

  try {
    const response = await fetch(request);
    if (response && response.ok) await assetCache.put(request, response.clone());
  } catch {
    // Keep the existing cached asset for offline use.
    void cached;
  }
}

async function cacheAssetsFromHtml(response, pageUrl) {
  const html = await response.text();
  const assetCache = await caches.open(STATIC_CACHE);
  const urls = new Set();
  const attrRe = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = attrRe.exec(html))) {
    try {
      const url = new URL(match[1], pageUrl);
      if (isCacheableAssetUrl(url)) urls.add(url.toString());
    } catch {
      // ignore malformed urls
    }
  }
  await Promise.all(Array.from(urls).map((raw) => cacheAssetUrl(assetCache, new URL(raw))));
}

async function reloadWindowClients() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(
    clients.map((client) => {
      try {
        const url = new URL(client.url);
        if (url.origin !== self.location.origin) return Promise.resolve(null);
        return client.navigate(client.url);
      } catch {
        return Promise.resolve(null);
      }
    }),
  );
}

async function cachePages(urls) {
  const cache = await caches.open(PAGE_CACHE);
  const assetWarmups = [];

  for (const rawUrl of urls) {
    try {
      const url = new URL(String(rawUrl || "/"), self.location.origin);
      if (url.origin !== self.location.origin || !isOfflinePagePath(url.pathname)) continue;

      const key = normalizedPageRequest(url);
      const cachedPage = await cache.match(key);
      if (cachedPage) {
        assetWarmups.push(cacheAssetsFromHtml(cachedPage.clone(), url).catch(() => null));
        continue;
      }

      const request = new Request(url.toString(), {
        method: "GET",
        credentials: "include",
        headers: { Accept: "text/html" },
      });
      const response = await fetch(request);
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.includes("text/html")) {
        await cache.put(key, response.clone());
        assetWarmups.push(cacheAssetsFromHtml(response.clone(), url).catch(() => null));
      }
    } catch {
      // Best-effort warmup only.
    }
  }

  await Promise.all(assetWarmups);
}
