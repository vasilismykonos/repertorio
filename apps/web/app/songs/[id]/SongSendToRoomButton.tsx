"use client";

type SongSendToRoomButtonProps = {
  songId: number;
  title: string;
};

export default function SongSendToRoomButton({
  songId,
  title,
}: SongSendToRoomButtonProps) {
  const handleClick = () => {
    if (typeof window === "undefined") {
      return;
    }

    const anyWindow = window as any;

    if (typeof anyWindow.RepRoomsSendSong !== "function") {
      console.warn(
        "[SongSendToRoomButton] RepRoomsSendSong is not available on window"
      );
      alert("Το σύστημα rooms δεν είναι διαθέσιμο αυτή τη στιγμή.");
      return;
    }

    const url = window.location.href;

    // Αν υπάρχει global __repSelectedTonicity από τα κουμπιά συγχορδιών,
    // τη χρησιμοποιούμε για να σταλεί στο room.
    const selectedTonicityRaw =
      (anyWindow.__repSelectedTonicity as string | null | undefined) ?? null;
    const selectedTonicity: string | null =
      typeof selectedTonicityRaw === "string" &&
      selectedTonicityRaw.trim() !== ""
        ? selectedTonicityRaw
        : null;

    try {
      anyWindow.RepRoomsSendSong(url, title, songId, selectedTonicity);
      console.log("[SongSendToRoomButton] Sent song to room:", {
        url,
        title,
        songId,
        selectedTonicity,
      });
    } catch (err) {
      console.error("[SongSendToRoomButton] Error sending song to room:", err);
      alert("Προέκυψε σφάλμα κατά την αποστολή του τραγουδιού στο room.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid #2b6cb0",
        background: "#2b6cb0",
        color: "#fff",
        textDecoration: "none",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      🔄 Room
    </button>
  );
}
