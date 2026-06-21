// apps/web/app/lists/new/page.tsx
import React from "react";
import ListNewClient from "./ListNewClient";
import { fetchJson } from "@/lib/api"; // ή "@/lib/apiClient" ανάλογα τι έχεις
import { getCurrentUserFromApi } from "@/lib/currentUser";

export default async function Page() {
  const currentUser = await getCurrentUserFromApi();

  if (!currentUser) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Νέα λίστα</h1>
        <p>Πρέπει να είστε συνδεδεμένος.</p>
      </section>
    );
  }

  const groups = await fetchJson(`/lists/groups?userId=${currentUser.id}`, { method: "GET" }).catch(() => []);

  return <ListNewClient viewerUserId={currentUser.id} groups={groups} />;
}
