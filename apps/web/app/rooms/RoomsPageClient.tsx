// apps/web/app/rooms/RoomsPageClient.tsx
"use client";

import { useEffect, useState } from "react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

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
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profile?: any | null;
};

export default function RoomsPageClient() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [roomsRes, userRes] = await Promise.all([
          fetch("/api/rooms", { cache: "no-store" }),
          fetch("/api/current-user", { cache: "no-store" }),
        ]);

        if (cancelled) return;

        // rooms
        if (roomsRes.ok) {
          const roomsJson = await roomsRes.json();
          setRooms(Array.isArray(roomsJson) ? roomsJson : []);
        } else {
          console.error("[RoomsPageClient] /api/rooms HTTP", roomsRes.status);
          setRooms([]);
        }

        // current user
        if (userRes.ok) {
          const userJson = await userRes.json();
          const u = userJson?.user ?? null;
          setCurrentUser(u && typeof u === "object" ? (u as CurrentUser) : null);
        } else {
          console.warn("[RoomsPageClient] /api/current-user HTTP", userRes.status);
          setCurrentUser(null);
        }
      } catch (err) {
        console.error("[RoomsPageClient] load error:", err);
        if (!cancelled) {
          setRooms([]);
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoggedIn = !!currentUser;
  const isAdmin = (currentUser?.role || "").toUpperCase() === "ADMIN";
  const currentRoom: string | null = null;

  return (
    <>
      <ActionBar
        left={<A.backLink href="/" label="Πίσω" />}
        right={
          <>
            <A.newLink href="/rooms/new" label="Νέο room" />
            {isAdmin && <A.settingsLink href="/rooms/settings" label="Ρυθμίσεις" />}
          </>
        }
      />

      <div id="rooms-wrapper">
        {loading ? (
          <div style={{ color: "#fff", marginTop: 8 }}>Φόρτωση rooms...</div>
        ) : (
          <RoomsClient
            initialRooms={rooms}
            isLoggedIn={isLoggedIn}
            isAdmin={isAdmin}
            initialCurrentRoom={currentRoom}
          />
        )}
      </div>
    </>
  );
}
