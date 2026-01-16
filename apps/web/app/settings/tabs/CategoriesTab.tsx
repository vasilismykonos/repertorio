// apps/web/app/settings/tabs/CategoriesTab.tsx
"use client";

import { useEffect, useState } from "react";
import CategoriesPageClient, {
  type CategoryListItem,
  type CategorySortKey,
} from "@/app/categories/CategoriesPageClient";

export default function CategoriesTab() {
  const [categories, setCategories] = useState<CategoryListItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Safe default for settings tab
  const sort: CategorySortKey = "title_asc";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(false);

      try {
        const res = await fetch("/api/v1/categories", {
          method: "GET",
          headers: { accept: "application/json" },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as CategoryListItem[];
        if (!cancelled) setCategories(Array.isArray(json) ? json : []);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setCategories([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !loadError && categories.length === 0) {
    return <div style={{ padding: 16, color: "#fff" }}>Φόρτωση κατηγοριών…</div>;
  }

  return (
    <div style={{ padding: 0, fontSize: 14, lineHeight: 1.2 }}>
      <CategoriesPageClient
        q=""
        sort={sort}
        take={50}
        skip={0}
        categories={categories}
        loadError={loadError}
      />
    </div>
  );
}
