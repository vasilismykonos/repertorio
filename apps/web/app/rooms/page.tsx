// apps/web/app/rooms/page.tsx

import "@/public/rooms/repertorio-rooms.css";
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

// Χρησιμοποιούμε την ίδια λογική με τα API routes
function getRoomsBaseUrl(): string {
  const base =
    process.env.ROOMS_HTTP_BASE_URL ||
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    "http://localhost:4455";

  return base.replace(/\/+$/, "");
}

// Φέρνει τη λίστα rooms απευθείας από τον Node rooms server
async function fetchRooms(): Promise<Room[]> {
  try {
    const res = await fetch(`${getRoomsBaseUrl()}/get-rooms`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(
        "[Rooms page] Αποτυχία επικοινωνίας με rooms server. Status:",
        res.status
      );
      return [];
    }

    const data = await res.json().catch(() => null);

    if (Array.isArray(data)) {
      return data as Room[];
    }

    if (data && Array.isArray((data as any).rooms)) {
      return (data as any).rooms as Room[];
    }

    return [];
  } catch (err) {
    console.error("[Rooms page] Σφάλμα κατά το fetchRooms:", err);
    return [];
  }
}

type CurrentUser = {
  id: number;
  email: string;
  role: string;
};

// Διαβάζει τον τρέχοντα χρήστη από το Nest API μέσω getCurrentUserFromApi()
async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const user = await getCurrentUserFromApi();
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  } catch (err) {
    console.error(
      "[Rooms page] Σφάλμα κατά το fetchCurrentUser:",
      err
    );
    return null;
  }
}

export default async function RoomsPage() {
  const [rooms, currentUser] = await Promise.all([
    fetchRooms(),
    fetchCurrentUser(),
  ]);

  const isLoggedIn = !!currentUser;
  const role = (currentUser?.role || "").toLowerCase();
  const isAdmin = role === "admin";

  // Προς το παρόν δεν έχουμε currentRoom στο νέο schema -> null
  const currentRoom: string | null = null;

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
