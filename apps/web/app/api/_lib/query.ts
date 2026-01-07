// apps/web/app/api/_lib/query.ts
import { NextRequest } from "next/server";

/**
 * Copies query parameters from NextRequest into a given URL.
 * Keeps all keys/values as-is (including repeated params).
 */
export function forwardSearchParams(req: NextRequest, url: URL): void {
  const { searchParams } = req.nextUrl;
  searchParams.forEach((value, key) => {
    // preserve repeated keys
    url.searchParams.append(key, value);
  });
}
