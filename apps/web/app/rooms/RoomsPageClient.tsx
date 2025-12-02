"use client";

import { useEffect, useState } from "react";
import RoomsClient from "./RoomsClient";

type Room = {
  room: string;
  userCount: number;
  hasPassword: boolean;
};

type CurrentUser = {
  id: number;
  email: string;
  role: string;
};

export default function RoomsPageClient() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // ΠΡΟΣΟΧΗ: πάμε ΠΑΝΤΑ μέσω Next API
        // και ΟΧΙ κατευθείαν στο http://localhost:4455
        const [roomsRes, userRes] = await Promise.all([
          fetch("/api/rooms", { cache: "no-store" }),
          fetch("/api/current-user", { cache: "no-store" }),
        ]);

        if (cancelled) return;

        // Rooms
        if (roomsRes.ok) {
          const roomsJson = await roomsRes.json();
          setRooms(Array.isArray(roomsJson) ? roomsJson : []);
        } else {
          console.error("[RoomsPageClient] /api/rooms HTTP", roomsRes.status);
          setRooms([]);
        }

        // Current user
        if (userRes.ok) {
          const userJson = await userRes.json();
          setCurrentUser(userJson?.user ?? null);
        } else {
          console.warn(
            "[RoomsPageClient] /api/current-user HTTP",
            userRes.status
          );
          setCurrentUser(null);
        }
      } catch (err) {
        console.error("[RoomsPageClient] load error:", err);
        if (!cancelled) {
          setRooms([]);
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const isLoggedIn = !!currentUser;
  const isAdmin = (currentUser?.role || "").toLowerCase() === "admin";
  const currentRoom: string | null = null; // προς το παρόν, δεν έχουμε schema field

  if (loading) {
    return (
      <div id="rooms-wrapper">
        <h3>Rooms</h3>
        <div style={{ color: "#fff", marginTop: 8 }}>Φόρτωση rooms...</div>
      </div>
    );
  }

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
