// apps/web/app/api/_lib/params.ts

/**
 * Parse a positive integer route param.
 * Returns null if invalid.
 */
export function parsePositiveIntParam(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  const i = Math.trunc(n);
  return i > 0 ? i : null;
}
