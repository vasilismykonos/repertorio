// apps/web/lib/roomsBaseUrl.ts

/**
 * Επιστρέφει τη βάση URL για τον Rooms server (Node index.js).
 *
 * Προτεραιότητα:
 *  - ROOMS_HTTP_BASE_URL (server-side only)
 *  - NEXT_PUBLIC_ROOMS_HTTP_BASE_URL (αν θες να το χρησιμοποιείς και από browser)
 *  - "http://localhost:4455" για local dev
 */
export function getRoomsBaseUrl(): string {
  const base =
    process.env.ROOMS_HTTP_BASE_URL ||
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    "http://localhost:4455";

  return base.replace(/\/+$/, "");
}
