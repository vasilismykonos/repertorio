/**
 * Slugify helper used across "dictionary" resources.
 *
 * Requirements for this project:
 * - Stable and deterministic.
 * - Greek-friendly (remove tonos/diacritics).
 * - Lowercase.
 * - Replace non-alphanumerics with single dashes.
 */
export function slugify(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // Remove diacritics (tonos etc)
  const noMarks = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Convert to lowercase, then replace anything that's not a letter/number with '-'
  const dashed = noMarks
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return dashed;
}
