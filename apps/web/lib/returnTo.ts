// apps/web/lib/returnTo.ts

/**
 * Standardised helpers for the "returnTo" flow used when creating a resource
 * from inside another form (e.g. create category from Song Edit).
 */

export function normaliseReturnTo(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed ? trimmed : null;
}

export function appendQueryParam(urlPath: string, key: string, value: string): string {
  // Use a dummy base because URL(...) requires an absolute URL
  const base = "http://local";
  const u = new URL(urlPath.startsWith("/") ? `${base}${urlPath}` : `${base}/${urlPath}`);
  u.searchParams.set(key, value);
  return `${u.pathname}${u.search}${u.hash}`;
}
