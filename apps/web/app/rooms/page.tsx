// apps/web/app/rooms/page.tsx
import RoomsPageClient from "./RoomsPageClient";

export const metadata = {
  title: "Rooms | Repertorio",
};

export default function RoomsPage() {
  return (
    <>
      <link rel="stylesheet" href="/rooms/repertorio-rooms.css" />
      <RoomsPageClient />
    </>
  );
}
