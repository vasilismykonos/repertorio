// apps/web/app/rooms/page.tsx

import "@/public/rooms/repertorio-rooms.css";
import { cookies } from "next/headers";
import RoomsClient from "./RoomsClient";

type Room = {
  room: string;
  userCount: number;
  hasPassword: boolean;
};

type CurrentUser = {
  id: number;
  username: string;
  role?: string | null;       // π.χ. "admin" | "user"
  currentRoom?: string | null; // αν το έχεις ήδη στο API
};

export const metadata = {
  title: "Rooms | Repertorio",
};

// --------- Φόρτωση rooms από Node /get-rooms ----------
async function fetchRooms(): Promise<Room[]> {
  try {
    const res = await fetch("https://repertorio.net/get-rooms", {
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    // Αν ο Node επιστρέφει {rooms:[...]} προσαρμόζουμε:
    if (Array.isArray(data)) {
      return data as Room[];
    }
    if (Array.isArray(data.rooms)) {
      return data.rooms as Room[];
    }
    return [];
  } catch (e) {
    console.error("fetchRooms error:", e);
    return [];
  }
}

// --------- Φόρτωση τρέχοντος χρήστη από /api/auth/me ----------
async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const cookieStore = cookies();
    const cookieHeader = cookieStore.toString();

    const res = await fetch("https://app.repertorio.net/api/auth/me", {
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const user = (await res.json()) as CurrentUser;
    return user;
  } catch (err) {
    console.error("fetchCurrentUser error:", err);
    return null;
  }
}

export default async function RoomsPage() {
  const [rooms, currentUser] = await Promise.all([
    fetchRooms(),
    fetchCurrentUser(),
  ]);

  const isLoggedIn = !!currentUser;
  const role = currentUser?.role?.toLowerCase() ?? "user";
  const isAdmin = role === "admin";
  const currentRoom = currentUser?.currentRoom ?? null;

  return (
    <div id="rooms-wrapper">
      <h3>Rooms</h3>

      <RoomsClient
        initialRooms={rooms}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        initialCurrentRoom={currentRoom}
      />
    </div>
  );
}
