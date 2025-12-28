// apps/web/app/categories/page.tsx
import Link from "next/link";
import { fetchJson } from "@/lib/api";

export const dynamic = "force-dynamic";

type CategoryItem = {
  id: number;
  title: string;
  slug?: string | null;
  songsCount?: number | null; // προαιρετικά, αν το API επιστρέφει πλήθος τραγουδιών
};

/**
 * Φόρτωση κατηγοριών από το backend.
 * Υποθέτουμε endpoint GET /categories που επιστρέφει πίνακα CategoryItem.
 */
async function fetchCategories(): Promise<CategoryItem[]> {
  try {
    const data = await fetchJson<CategoryItem[]>("/categories");

    if (!Array.isArray(data)) {
      return [];
    }

    return data;
  } catch (error) {
    console.error("Σφάλμα φόρτωσης κατηγοριών:", error);
    return [];
  }
}

export default async function CategoriesPage() {
  const categories = await fetchCategories();

  return (
    <main
      className="categories-page"
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "15px 10px 40px",
        color: "#fff",
      }}
    >
      {/* Τίτλος σελίδας */}
      <header
        style={{
          marginBottom: 20,
          borderBottom: "1px solid rgba(255,255,255,0.2)",
          paddingBottom: 10,
        }}
      >
        <h1
          style={{
            fontSize: 24,
            margin: 0,
            marginBottom: 5,
          }}
        >
          Κατηγορίες
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            opacity: 0.8,
          }}
        >
          Επίλεξε κατηγορία για να δεις τα τραγούδια που ανήκουν σε αυτήν.
        </p>
      </header>

      {/* Λίστα κατηγοριών */}
      <section>
        {categories.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.8 }}>
            Δεν βρέθηκαν κατηγορίες.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {categories.map((cat) => {
              const hasCount =
                typeof cat.songsCount === "number" &&
                !Number.isNaN(cat.songsCount);

              return (
                <li
                  key={cat.id}
                  style={{
                    marginBottom: 8,
                  }}
                >
                  <Link
                    href={`/songs?category_id=${cat.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      textDecoration: "none",
                      padding: "10px 12px",
                      borderRadius: 8,
                      backgroundColor: "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        color: "#fff",
                      }}
                    >
                      {cat.title}
                    </span>

                    {hasCount && (
                      <span
                        style={{
                          fontSize: 13,
                          color: "#ddd",
                          whiteSpace: "nowrap",
                          marginLeft: 12,
                        }}
                      >
                        {cat.songsCount} τραγούδι
                        {cat.songsCount === 1 ? "" : "α"}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
