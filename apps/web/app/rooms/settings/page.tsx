import { redirect } from "next/navigation";
import { getCurrentUserFromApi } from "@/lib/currentUser";
import RoomsSettingsClient from "./RoomsSettingsClient";

export const metadata = {
  title: "Rooms Settings | Repertorio",
};

export default async function RoomsSettingsPage() {
  const user = await getCurrentUserFromApi();

  if (!user || user.role !== "ADMIN") {
    redirect("/rooms");
  }

  return (
    <>
      <link rel="stylesheet" href="/rooms/repertorio-rooms.css" />
      <RoomsSettingsClient />
    </>
  );
}
