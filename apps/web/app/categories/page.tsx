// apps/web/app/categories/page.tsx
import Link from "next/link";
import { fetchJson } from "@/lib/api";

import ActionBar from "@/app/components/ActionBar";
import LinkButton from "@/app/components/LinkButton";

type CategoryListItem = {
  id: number;
  title: string;
  slug: string;
  songsCount: number;
};

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  let categories: CategoryListItem[] = [];
  try {
    categories = await fetchJson<CategoryListItem[]>("/categories");
  } catch {
    // ignore fetch errors; categories will remain empty
  }

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      {/* ✅ ΠΡΟΤΥΠΟ: Actions ΠΑΝΩ */}
      <ActionBar
        right={
          <LinkButton
            href="/categories/new"
            variant="primary"
            title="Νέα κατηγορία"
          >
            + Νέα κατηγορία
          </LinkButton>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Κατηγορίες</h1>

      {categories.length === 0 ? (
        <p style={{ color: "#888" }}>Δεν υπάρχουν κατηγορίες.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {categories.map((cat) => (
            <li
              key={cat.id}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid #333",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                <Link
                  href={`/categories/${cat.id}`}
                  style={{ color: "#ccc", textDecoration: "none" }}
                >
                  {cat.title}
                </Link>
              </span>
              <span style={{ color: "#888", fontSize: 14 }}>
                {cat.songsCount} τραγούδι(α)
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
