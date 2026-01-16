// apps/web/app/rooms/page.tsx

import RoomsClient from "./RoomsClient";
import { getCurrentUserFromApi } from "@/lib/currentUser";

type Room = {
  room: string;
  userCount: number;
  hasPassword: boolean;
};

export const metadata = {
  title: "Rooms | Repertorio",
};

/**
 * Βασικό URL για τον rooms server (HTTP).
 *
 * - ROOMS_HTTP_BASE_URL: εσωτερικό (server-side)
 * - NEXT_PUBLIC_ROOMS_HTTP_BASE_URL: public (αν το χρησιμοποιήσεις παντού)
 *
 * Αν δεν έχουν οριστεί, θα πέσει στο http://127.0.0.1:4455
 */
function getRoomsBaseUrl(): string {
  const base =
    process.env.ROOMS_HTTP_BASE_URL ||
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    "http://127.0.0.1:4455";

  return base.replace(/\/+$/, "");
}

/**
 * Φέρνει την αρχική λίστα rooms από τον rooms server.
 * Χρησιμοποιεί το endpoint /get-rooms που υλοποιεί το apps/rooms/index.js.
 */
async function fetchInitialRooms(): Promise<Room[]> {
  try {
    const base = getRoomsBaseUrl();
    const res = await fetch(`${base}/get-rooms`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[RoomsPage] /get-rooms HTTP error:", res.status);
      return [];
    }

    const data = await res.json();

    if (Array.isArray(data)) {
      return data as Room[];
    }

    if (Array.isArray((data as any).rooms)) {
      return (data as any).rooms as Room[];
    }

    return [];
  } catch (err) {
    console.error("[RoomsPage] fetchInitialRooms error:", err);
    return [];
  }
}

export default async function RoomsPage() {
  // Τρέχων χρήστης μέσω Nest API (getCurrentUserFromApi)
  const currentUser = await getCurrentUserFromApi();
  const isLoggedIn = !!currentUser;
  const isAdmin = currentUser?.role === "ADMIN";

  // Αρχικά rooms από τον rooms server
  const rooms = await fetchInitialRooms();

  // Στο νέο σύστημα το current room κρατιέται κυρίως μέσω WebSocket / localStorage
  const initialCurrentRoom: string | null = null;

  return (
    <>
      {/* CSS από public/ πρέπει να φορτώνεται ως URL, όχι με import */}
      <link rel="stylesheet" href="/rooms/repertorio-rooms.css" />

      <div
        id="rooms-wrapper"
        style={{
          maxWidth: 850,
          margin: "0 auto",
          color: "#eee",
          fontFamily: "'Segoe UI', sans-serif",
        }}
      >
        <h3 style={{ marginBottom: 10 }}>🔄 Rooms</h3>

        <RoomsClient
          initialRooms={rooms}
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          initialCurrentRoom={initialCurrentRoom}
        />
      </div>
    </>
  );
}
