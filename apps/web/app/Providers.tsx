// app/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { RoomsProvider } from "./components/RoomsProvider";
import RoomsSongSyncHandler from "./components/RoomsSongSyncHandler";
import PresencePinger from "./components/PresencePinger";
import UserHistoryTracker from "./components/UserHistoryTracker";
import FloatingChatWidget from "./components/FloatingChatWidget";

function FloatingChatMount() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHidden(params.get("embed") === "1" || params.get("listPreview") === "1");
  }, []);

  return hidden ? null : <FloatingChatWidget />;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PresencePinger />
      <UserHistoryTracker />
      <FloatingChatMount />
      <RoomsProvider>
        {/* Listener για rep_song_sync ώστε να ανοίγει το τραγούδι στους άλλους */}
        <RoomsSongSyncHandler />
        {children}
      </RoomsProvider>
    </SessionProvider>
  );
}
