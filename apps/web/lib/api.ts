// apps/web/lib/api.ts

/**
 * Βασικό URL για εσωτερικές κλήσεις από τον Next server προς το Nest API.
 * Το Nest (main.ts) ακούει στο 127.0.0.1:3000 με prefix /api/v1.
 *
 * Αν δεν δοθεί API_INTERNAL_BASE_URL στο περιβάλλον, κάνουμε default:
 *   http://127.0.0.1:3000/api/v1
 */
const API_INTERNAL_BASE_URL: string = (
  process.env.API_INTERNAL_BASE_URL || "http://127.0.0.1:3000/api/v1"
).replace(/\/$/, "");

/**
 * Βασικό URL για κλήσεις από browser (client-side).
 *
 * - Αν υπάρχει NEXT_PUBLIC_API_BASE_URL (όπως τώρα: https://app.repertorio.net/api/v1)
 *   το χρησιμοποιούμε αυτούσιο.
 * - Αλλιώς κάνουμε fallback στο "/api/v1" ώστε να παίζει μέσω Nginx reverse proxy.
 */
const API_BROWSER_BASE_URL: string = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1"
).replace(/\/$/, "");

/**
 * Γενική συνάρτηση για κλήσεις JSON στο backend API.
 *
 * - Αν το path είναι absolute (αρχίζει με http:// ή https://), χρησιμοποιείται αυτούσιο.
 * - Αλλιώς:
 *   - Στην πλευρά του server (SSR / RSC) → χρησιμοποιεί API_INTERNAL_BASE_URL.
 *   - Στην πλευρά του browser → χρησιμοποιεί API_BROWSER_BASE_URL.
 */
export async function fetchJson<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isAbsolute =
    path.startsWith("http://") || path.startsWith("https://");

  if (isAbsolute) {
    // Αν είναι ήδη πλήρες URL, δεν πειράζουμε τίποτα
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
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

  // ΜΗ absolute path → αποφασίζουμε βάση περιβάλλοντος (server vs browser)
  const base =
    typeof window === "undefined"
      ? API_INTERNAL_BASE_URL
      : API_BROWSER_BASE_URL;

  // Φροντίζουμε το path να ξεκινάει πάντα με "/"
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const url = `${base}${normalizedPath}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
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

  // Fallback για text απαντήσεις
  return (await res.text()) as any;
}
