// apps/web/app/lists/new/page.tsx
import React from "react";
import ListNewClient from "./ListNewClient";
import { fetchJson } from "@/lib/api"; // ή "@/lib/apiClient" ανάλογα τι έχεις

export default async function Page() {
  // ⚠️ εδώ χρησιμοποίησε το ίδιο pattern που ήδη έχεις σε άλλα pages
  // π.χ. από session / me endpoint. Αν ήδη στο lists edit page.tsx το έχεις,
  // κάνε copy-paste την ίδια λογική.

  const viewerUserId = 1; // TODO: βάλε το πραγματικό από session όπως στα άλλα pages

  const groups = await fetchJson(`/lists/groups?userId=${viewerUserId}`, { method: "GET" }).catch(() => []);

  return <ListNewClient viewerUserId={viewerUserId} groups={groups} />;
}