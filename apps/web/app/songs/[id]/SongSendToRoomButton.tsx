"use client";

import React from "react";
import { A } from "../../components/buttons";

type SongSendToRoomButtonProps = {
  songId: number;
  title: string;
};

const ROOM_SENT_FLASH_MS = 1200;

export default function SongSendToRoomButton({ songId, title }: SongSendToRoomButtonProps) {
  const [sentFlash, setSentFlash] = React.useState(false);
  const sentFlashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (sentFlashTimerRef.current) {
        clearTimeout(sentFlashTimerRef.current);
      }
    };
  }, []);

  function showSentFlash() {
    setSentFlash(true);
    if (sentFlashTimerRef.current) clearTimeout(sentFlashTimerRef.current);
    sentFlashTimerRef.current = setTimeout(() => {
      setSentFlash(false);
      sentFlashTimerRef.current = null;
    }, ROOM_SENT_FLASH_MS);
  }

  const handleClick = () => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;

    if (typeof anyWindow.RepRoomsSendSong !== "function") {
      console.warn("[SongSendToRoomButton] RepRoomsSendSong is not available on window");
      alert("Το σύστημα rooms δεν είναι διαθέσιμο αυτή τη στιγμή.");
      return;
    }

    const url = window.location.href;

    const selectedTonicityRaw =
      (anyWindow.__repSelectedTonicity as string | null | undefined) ?? null;

    const selectedTonicity: string | null =
      typeof selectedTonicityRaw === "string" && selectedTonicityRaw.trim() !== ""
        ? selectedTonicityRaw
        : null;

    try {
      const sent = anyWindow.RepRoomsSendSong(url, title, songId, selectedTonicity);
      if (sent === true) {
        showSentFlash();
        console.log("[SongSendToRoomButton] Sent song to room:", {
          url,
          title,
          songId,
          selectedTonicity,
        });
      }
    } catch (err) {
      console.error("[SongSendToRoomButton] Error sending song to room:", err);
      alert("Προέκυψε σφάλμα κατά την αποστολή του τραγουδιού στο room.");
    }
  };

  return A.room({
    onClick: handleClick,
    title: sentFlash ? "Στάλθηκε στο room" : "Αποστολή στο room",
    label: sentFlash ? "Στάλθηκε" : "Room",
    action: sentFlash ? "apply" : "room",
  });
}
