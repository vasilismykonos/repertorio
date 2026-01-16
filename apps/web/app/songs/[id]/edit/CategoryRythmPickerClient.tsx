// apps/web/app/songs/[id]/edit/CategoryRythmPickerClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

import { A } from "@/app/components/buttons";

export type CategoryOption = { id: number; title: string };
export type RythmOption = { id: number; title: string };

type Props = {
  initialCategoryId: number | null;
  initialRythmId: number | null;

  categories: CategoryOption[];
  rythms: RythmOption[];
};

function sortByTitle<T extends { title: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.title.localeCompare(b.title, "el"));
}

function readNumericQueryParam(param: string): number | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const v = (sp.get(param) ?? "").trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.trunc(n);
  } catch {
    return null;
  }
}

export default function CategoryRythmPickerClient({
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

  // ✅ κρατάμε state (όπως πριν) αλλά πλέον δεν κάνουμε inline create.
  // Απλά συγχρονίζουμε από props όταν ο server φέρει νέα λίστα.
  const [rythmOptions, setRythmOptions] = useState<RythmOption[]>(() =>
    sortByTitle(rythms),
  );

  // ✅ όταν αλλάζει το initialCategoryId (π.χ. επιστροφή με ?categoryId=17),
  // συγχρονίζουμε το state ώστε να “επιλεγεί” πραγματικά στο UI.
  useEffect(() => {
    const desired = initialCategoryId != null ? String(initialCategoryId) : "";
    setCategoryId((prev) => (prev === desired ? prev : desired));
  }, [initialCategoryId]);

  // ✅ αντίστοιχα για rythm: από props
  useEffect(() => {
    const desired = initialRythmId != null ? String(initialRythmId) : "";
    setRythmId((prev) => (prev === desired ? prev : desired));
  }, [initialRythmId]);

  // ✅ και οι ρυθμοί να συγχρονίζονται αν ο server φέρει νέα λίστα (π.χ. refresh)
  useEffect(() => {
    setRythmOptions(sortByTitle(rythms));
  }, [rythms]);

  // ✅ Επιπλέον: αν ο caller επιστρέψει με query string (?categoryId=... / ?rythmId=...),
  // διαβάζουμε μία φορά και “κουμπώνουμε” την επιλογή, όπως ακριβώς περιγράφεις.
  // Αυτό καλύπτει 100% το ίδιο flow με το category.
  useEffect(() => {
    const qCategoryId = readNumericQueryParam("categoryId");
    if (qCategoryId != null) {
      const desired = String(qCategoryId);
      setCategoryId((prev) => (prev === desired ? prev : desired));
    }

    const qRythmId = readNumericQueryParam("rythmId");
    if (qRythmId != null) {
      const desired = String(qRythmId);
      setRythmId((prev) => (prev === desired ? prev : desired));
    }
  }, []);

  function goCreateCategory() {
    const returnTo = window.location.pathname + window.location.search;
    const url = `/categories/new?returnTo=${encodeURIComponent(returnTo)}`;
    window.location.assign(url);
  }

  function goCreateRythm() {
    const returnTo = window.location.pathname + window.location.search;
    const url = `/rythms/new?returnTo=${encodeURIComponent(returnTo)}`;
    window.location.assign(url);
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

          {A.add({
            onClick: goCreateCategory,
            label: "Νέα",
            title: "Δημιουργία νέας κατηγορίας",
            action: "new",
          })}
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

          {A.add({
            onClick: goCreateRythm,
            label: "Νέος",
            title: "Δημιουργία νέου ρυθμού",
            action: "new",
          })}
        </div>
      </div>
    </div>
  );
}
