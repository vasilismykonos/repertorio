// app/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { RoomsProvider } from "./components/RoomsProvider";
import RoomsSongSyncHandler from "./components/RoomsSongSyncHandler";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <RoomsProvider>
        {/* Listener για rep_song_sync ώστε να ανοίγει το τραγούδι στους άλλους */}
        <RoomsSongSyncHandler />
        {children}
      </RoomsProvider>
    </SessionProvider>
  );
}
