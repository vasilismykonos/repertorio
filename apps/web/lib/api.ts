// apps/web/lib/api.ts

/**
 * Βασικό URL για εσωτερικές κλήσεις από τον Next server προς το Nest API.
 *
 * Προτεραιότητα:
 * 1) API_INTERNAL_BASE_URL (server-side only)
 * 2) NEXT_PUBLIC_API_BASE_URL (fallback)
 *
 * Σημείωση:
 * - Δεν βάζουμε default εδώ. Αν λείπει, είναι misconfig και θέλουμε να σκάσει.
 */
const API_INTERNAL_BASE_URL: string = (
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  ""
).replace(/\/$/, "");

/**
 * Βασικό URL για κλήσεις από browser (client-side).
 *
 * - Αν υπάρχει NEXT_PUBLIC_API_BASE_URL το χρησιμοποιούμε αυτούσιο.
 * - Αλλιώς fallback στο "/api/v1" ώστε να παίζει μέσω Nginx reverse proxy.
 */
const API_BROWSER_BASE_URL: string = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1"
).replace(/\/$/, "");

/**
 * Επιστρέφει true αν το path είναι absolute URL.
 */
function isAbsoluteUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

/**
 * Normalizes path ώστε να ξεκινά με "/".
 */
function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Επιστρέφει την HTTP method σε uppercase (default GET).
 */
function getMethod(options: RequestInit): string {
  return String(options.method || "GET").toUpperCase();
}

/**
 * Επιβάλλουμε server-side no-store για GET/HEAD, εκτός αν ο caller έχει ορίσει
 * ρητά cache behavior (options.cache ή options.next).
 *
 * Αυτό αποτρέπει “stale” responses σε RSC/SSR fetch (κλασικό πρόβλημα Next fetch cache).
 */
function applyServerNoStoreDefaults(options: RequestInit): RequestInit {
  const method = getMethod(options);
  const isServer = typeof window === "undefined";

  if (!isServer) return options;

  const isReadMethod = method === "GET" || method === "HEAD";
  if (!isReadMethod) return options;

  const hasExplicitCache =
    typeof (options as any).cache !== "undefined" ||
    typeof (options as any).next !== "undefined";

  if (hasExplicitCache) return options;

  return {
    ...options,
    cache: "no-store",
    // Next.js fetch extension (safe στο server). Αν δεν το καταλάβει, απλώς αγνοείται.
    next: { revalidate: 0 } as any,
  };
}

/**
 * Γενική συνάρτηση για κλήσεις JSON στο backend API.
 *
 * - Αν το path είναι absolute (http/https), χρησιμοποιείται αυτούσιο.
 * - Αλλιώς:
 *   - Server (SSR / RSC) → API_INTERNAL_BASE_URL (ή NEXT_PUBLIC_API_BASE_URL)
 *   - Browser → API_BROWSER_BASE_URL
 */
export async function fetchJson<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const finalOptionsBase = applyServerNoStoreDefaults(options);
  const method = getMethod(finalOptionsBase);

  // Συνθέτουμε headers χωρίς να “σπάμε” caller headers.
  // Content-Type: application/json έχει νόημα κυρίως σε requests με body,
  // αλλά δεν κάνει κακό στα GET — παρ’ όλα αυτά το κρατάμε απλό/σταθερό.
  const headers: Record<string, string> = {
    ...(finalOptionsBase.headers as any),
  };

  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (isAbsoluteUrl(path)) {
    const res = await fetch(path, {
      ...finalOptionsBase,
      headers,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(
        `API error ${res.status} ${res.statusText} for ${path} – body: ${bodyText}`,
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as any;
  }

  const base =
    typeof window === "undefined" ? API_INTERNAL_BASE_URL : API_BROWSER_BASE_URL;

  if (!base) {
    throw new Error(
      "Missing API base URL. Set API_INTERNAL_BASE_URL (server) and/or NEXT_PUBLIC_API_BASE_URL (client).",
    );
  }

  const url = `${base}${normalizePath(path)}`;

  const res = await fetch(url, {
    ...finalOptionsBase,
    headers,
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `API error ${res.status} ${res.statusText} for ${url} – body: ${bodyText}`,
    );
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }

  return (await res.text()) as any;
}
