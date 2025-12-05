// app/components/RoomsSongSyncHandler.tsx
"use client";

import { useEffect } from "react";

/**
 * RoomsSongSyncHandler
 *
 * Ακούει το custom event "rep_song_sync" που εκπέμπει το RoomsProvider
 * όταν λάβει μήνυμα type: "song_sync" από τον WebSocket server.
 *
 * Στόχοι:
 *  - Να κάνει redirect στο τραγούδι ΜΟΝΟ όταν:
 *    * το payload.kind === "song"
 *    * υπάρχει payload.url
 *    * ΔΕΝ έχουμε ήδη ακολουθήσει αυτό το syncId για το συγκεκριμένο room.
 *  - Να μην ξανακάνει redirect στο ίδιο sync (ίδιο syncId) όταν:
 *    * ξαναμπαίνουμε στη σελίδα,
 *    * ξαναμπαίνουμε στο ίδιο room,
 *    * ή ο server μας στέλνει ξανά το ίδιο lastSync.
 *
 * Αποθήκευση:
 *  - Χρησιμοποιούμε sessionStorage ανά tab:
 *    key = "rep_last_song_sync::<roomName>"
 *    value = syncId (number)
 */
export default function RoomsSongSyncHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    type SongPayload = {
      kind?: string;
      url?: string;
      title?: string | null;
      songId?: number | null;
      selectedTonicity?: string | null;
      sentAt?: number | null;
    };

    type SongSyncDetail = {
      room?: string | null;
      syncId?: number | null;
      payload?: SongPayload | null;
    };

    const handler = (event: Event) => {
      const custom = event as CustomEvent<SongSyncDetail>;
      const detail = custom.detail;

      if (!detail || !detail.payload) {
        return;
      }

      const room = detail.room || "";
      const syncId = typeof detail.syncId === "number" ? detail.syncId : 0;
      const payload = detail.payload;
      const url = payload?.url || "";

      // Πρέπει να είναι "song" και να υπάρχει url
      if (!url || payload?.kind !== "song") {
        return;
      }

      // Αν είμαστε ήδη στο ίδιο URL, δεν έχει νόημα να κάνουμε redirect.
      // Απλώς ενημερώνουμε ότι το συγκεκριμένο syncId θεωρείται "handled".
      if (window.location.href === url) {
        try {
          if (syncId > 0 && room) {
            const key = `rep_last_song_sync::${room}`;
            window.sessionStorage.setItem(key, String(syncId));
          }
        } catch {
          // αγνόησε τυχόν σφάλματα στο sessionStorage
        }
        return;
      }

      // Έλεγχος: έχουμε ήδη χειριστεί αυτό το syncId για το συγκεκριμένο room;
      try {
        if (syncId > 0 && room) {
          const key = `rep_last_song_sync::${room}`;
          const prevRaw = window.sessionStorage.getItem(key);
          const prev = prevRaw ? Number(prevRaw) : 0;

          // Αν το προηγούμενο syncId είναι >= από το τρέχον,
          // τότε είτε είναι το ίδιο sync είτε πιο "νέο".
          // Σε κάθε περίπτωση ΔΕΝ ξανακάνουμε redirect.
          if (prev && prev >= syncId) {
            return;
          }

          // Αλλιώς, αποθηκεύουμε το νέο syncId σαν "handled"
          window.sessionStorage.setItem(key, String(syncId));
        }
      } catch {
        // Αν αποτύχει το sessionStorage, απλά συνεχίζουμε χωρίς dedupe.
      }

      // Τελικό βήμα: κάνουμε redirect στο νέο τραγούδι.
      // Απλό hard redirect – συμβατό με όλες τις σελίδες (Next, παλιό WP, κτλ.)
      window.location.href = url;
    };

    window.addEventListener("rep_song_sync", handler as EventListener);

    return () => {
      window.removeEventListener("rep_song_sync", handler as EventListener);
    };
  }, []);

  // Δεν αποδίδει τίποτα στο DOM – μόνο side-effect.
  return null;
}
