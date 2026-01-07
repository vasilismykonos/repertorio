// apps/web/app/songs/[id]/edit/CategoryRythmPickerClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

export type CategoryOption = { id: number; title: string };
export type RythmOption = { id: number; title: string };

type Props = {
  apiBase: string; // κρατιέται για parity, δεν χρησιμοποιείται για categories

  initialCategoryId: number | null;
  initialRythmId: number | null;

  categories: CategoryOption[];
  rythms: RythmOption[];
};

function sortByTitle<T extends { title: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.title.localeCompare(b.title, "el"));
}

export default function CategoryRythmPickerClient({
  apiBase,
  initialCategoryId,
  initialRythmId,
  categories,
  rythms,
}: Props) {
  const [categoryId, setCategoryId] = useState(
    initialCategoryId != null ? String(initialCategoryId) : "",
  );
  const [rythmId, setRythmId] = useState(
    initialRythmId != null ? String(initialRythmId) : "",
  );

  // ✅ derived από props (ώστε να ανανεώνεται μετά το redirect/refresh)
  const categoryOptions = useMemo(() => sortByTitle(categories), [categories]);

  // Ρυθμοί: κρατάμε state γιατί κάνουμε inline create
  const [rythmOptions, setRythmOptions] = useState<RythmOption[]>(() =>
    sortByTitle(rythms),
  );

  // ✅ όταν αλλάζει το initialCategoryId (π.χ. επιστροφή με ?categoryId=17),
  // συγχρονίζουμε το state ώστε να “επιλεγεί” πραγματικά στο UI.
  useEffect(() => {
    const desired = initialCategoryId != null ? String(initialCategoryId) : "";
    setCategoryId((prev) => (prev === desired ? prev : desired));
  }, [initialCategoryId]);

  // αντίστοιχα για rythm (αν ποτέ το χρησιμοποιήσεις στο ίδιο pattern)
  useEffect(() => {
    const desired = initialRythmId != null ? String(initialRythmId) : "";
    setRythmId((prev) => (prev === desired ? prev : desired));
  }, [initialRythmId]);

  // ✅ και οι ρυθμοί να συγχρονίζονται αν ο server φέρει νέα λίστα (π.χ. refresh)
  useEffect(() => {
    setRythmOptions(sortByTitle(rythms));
  }, [rythms]);

  function goCreateCategory() {
    const returnTo = window.location.pathname + window.location.search;
    const url = `/categories/new?returnTo=${encodeURIComponent(returnTo)}`;
    window.location.assign(url);
  }

  async function createRythmInline() {
    const raw = window.prompt("Νέος ρυθμός (τίτλος):", "");
    const title = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!title) return;

    const res = await fetch("/api/rythms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`Αποτυχία δημιουργίας ρυθμού.\n${txt}`);
      return;
    }

    const created = (await res.json()) as { id: number; title: string };
    setRythmOptions((prev) => sortByTitle([...prev, created]));
    setRythmId(String(created.id));
  }

  return (
    <div className="song-edit-section song-edit-grid">
      <div className="song-edit-field">
        <label htmlFor="categoryId">Κατηγορία</label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            id="categoryId"
            name="categoryId"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="song-edit-input-light"
            style={{ flex: 1 }}
          >
            <option value="">(Χωρίς κατηγορία)</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={goCreateCategory}
            className="song-edit-submit"
            title="Δημιουργία νέας κατηγορίας"
          >
            + Νέα
          </button>
        </div>
      </div>

      <div className="song-edit-field">
        <label htmlFor="rythmId">Ρυθμός</label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            id="rythmId"
            name="rythmId"
            value={rythmId}
            onChange={(e) => setRythmId(e.target.value)}
            className="song-edit-input-light"
            style={{ flex: 1 }}
          >
            <option value="">(Χωρίς ρυθμό)</option>
            {rythmOptions.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={createRythmInline}
            className="song-edit-submit"
            title="Προσθήκη νέου ρυθμού"
          >
            + Νέος
          </button>
        </div>
      </div>
    </div>
  );
}
