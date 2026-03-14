// apps/web/app/settings/page.tsx
import { notFound } from "next/navigation";
import SettingsClient from "./settings-client";
import { getCurrentUserFromApi } from "../../lib/currentUser";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUserFromApi();

  if (!user) notFound();
  if (user.role !== "ADMIN") notFound();

  return <SettingsClient />;
}