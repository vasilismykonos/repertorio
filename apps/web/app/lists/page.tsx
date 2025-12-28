// apps/web/app/lists/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Λίστες | Repertorio Next",
  description: "Λίστες τραγουδιών του χρήστη από το παλιό Repertorio.",
};

// Πρέπει να ταιριάζει με αυτά που επιστρέφει το /lists API (ListsService.getListsIndex)
type ListSummary = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
};

type ListGroupSummary = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
};

type ListsIndexResponse = {
  items: ListSummary[];
  total: number;
  page: number;
  pageSize: number;
  groups: ListGroupSummary[];
};

type ListsPageSearchParams = {
  search?: string;
  groupId?: string; // "", "null" ή αριθμητικό groupId
  page?: string;
};

/**
 * Χτίζει URL για τη σελίδα /lists κρατώντας παραμέτρους.
 * - search: κείμενο αναζήτησης τίτλου λίστας
 * - groupId: "", "null" ή αριθμός groupId
 * - page: σελίδα (1-based)
 */
function buildPageUrl(params: {
  search?: string;
  groupId?: string;
  page?: number;
}) {
  const sp = new URLSearchParams();

  if (params.search && params.search.trim()) {
    sp.set("search", params.search.trim());
  }

  if (params.groupId !== undefined && params.groupId !== "") {
    sp.set("groupId", params.groupId);
  }

  if (params.page && params.page > 1) {
    sp.set("page", String(params.page));
  }

  const qs = sp.toString();
  return qs ? `/lists?${qs}` : "/lists";
}

export default async function ListsPage({
  searchParams,
}: {
  searchParams: ListsPageSearchParams;
}) {
  // -----------------------------
  // Ανάγνωση query params
  // -----------------------------
  const rawSearch = searchParams.search ?? "";
  const search = rawSearch.trim();

  const rawGroupId = searchParams.groupId ?? "";
  // "", "null" ή αριθμός ως string
  const groupId = rawGroupId;

  const rawPage = searchParams.page ?? "1";
  const page = Number(rawPage) > 0 ? Number(rawPage) : 1;
  const pageSize = 20; // ταιριάζει με default του ListsService.getListsForUser

  // -----------------------------
  // Current user
  // -----------------------------
  let currentUser: { id: number } | null = null;

  try {
    currentUser = await getCurrentUserFromApi();
  } catch (err) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστες</h1>
        <p>Αποτυχία ανάκτησης στοιχείων χρήστη. ({String(err)})</p>
      </section>
    );
  }

  if (!currentUser) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστες</h1>
        <p>Πρέπει να είστε συνδεδεμένος για να δείτε τις λίστες σας.</p>
      </section>
    );
  }

  // -----------------------------
  // Κλήση API /lists
  // -----------------------------
  const apiParams = new URLSearchParams();
  apiParams.set("userId", String(currentUser.id));
  apiParams.set("page", String(page));
  apiParams.set("pageSize", String(pageSize));

  if (search) {
    apiParams.set("search", search);
  }
  if (groupId) {
    // "", "null" ή αριθμός
    apiParams.set("groupId", groupId);
  }

  const apiUrl = `/lists?${apiParams.toString()}`;

  let data: ListsIndexResponse;
  try {
    data = await fetchJson<ListsIndexResponse>(apiUrl);
  } catch (err: any) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστες</h1>
        <p>
          Σφάλμα κατά την ανάκτηση λιστών. (
          {String(err?.message || err)})
        </p>
      </section>
    );
  }

  const { items, total, groups } = data;

  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  // Υπολογισμός αριθμού λιστών χωρίς ομάδα όπως στο παλιό lists.php:
  // no_group_count = total_lists_count - sum(listsCount των groups)
  const totalFromGroups = groups.reduce(
    (acc, g) => acc + (Number.isFinite(g.listsCount) ? g.listsCount : 0),
    0,
  );
  const noGroupCount = Math.max(total - totalFromGroups, 0);

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <section style={{ padding: "1rem" }}>
      <h1 style={{ fontSize: "1.8rem", marginBottom: "0.75rem" }}>Λίστες</h1>

      {/* Φόρμα αναζήτησης (όπως στο παλιό, μόνο για τίτλο λίστας) */}
      <form
        action="/lists"
        method="get"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Αναζήτηση λίστας..."
            style={{
              flex: "1 1 220px",
              minWidth: "180px",
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid #ccc",
              fontSize: "0.95rem",
            }}
          />
          {/* Αν έχουμε ενεργό groupId, το κρατάμε στο submit */}
          {groupId && (
            <input type="hidden" name="groupId" value={groupId} />
          )}
          <button
            type="submit"
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: "#0070f3",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            Αναζήτηση
          </button>
        </div>
      </form>

      {/* Φίλτρα ομάδων – Όλες / Χωρίς ομάδα / κάθε ομάδα με πλήθος
          Αντίστοιχο της .active-filters στο παλιό lists.php */}
      <div
        className="active-filters"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        {/* Όλες */}
        <Link
          className="active-filters-item"
          href={buildPageUrl({ search, groupId: "", page: 1 })}
          style={{
            padding: "6px 12px",
            borderRadius: 16,
            background: !groupId ? "#0070f3" : "#222",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "0.9rem",
          }}
        >
          Όλες ({total})
        </Link>

        {/* Χωρίς ομάδα */}
        <Link
          className="active-filters-item"
          href={buildPageUrl({ search, groupId: "null", page: 1 })}
          style={{
            padding: "6px 12px",
            borderRadius: 16,
            background: groupId === "null" ? "#0070f3" : "#222",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "0.9rem",
          }}
        >
          Χωρίς ομάδα ({noGroupCount})
        </Link>

        {/* Κάθε ομάδα */}
        {groups.map((g) => {
          const isActive =
            groupId !== "" && groupId !== "null" && groupId === String(g.id);
          const label = g.fullTitle || g.title || `Ομάδα #${g.id}`;

          return (
            <Link
              key={g.id}
              className="active-filters-item"
              href={buildPageUrl({
                search,
                groupId: String(g.id),
                page: 1,
              })}
              style={{
                padding: "6px 12px",
                borderRadius: 16,
                background: isActive ? "#0070f3" : "#222",
                color: "#fff",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "0.9rem",
              }}
            >
              {label} ({g.listsCount})
            </Link>
          );
        })}
      </div>

      {/* Αν υπάρχει επιλεγμένη ομάδα, εμφανίζουμε τον τίτλο της (αντίστοιχο current_group_title) */}
      {groupId &&
        groupId !== "null" &&
        (() => {
          const gid = Number(groupId);
          const activeGroup = groups.find((g) => g.id === gid);
          if (!activeGroup) return null;
          const label = activeGroup.fullTitle || activeGroup.title;
          if (!label) return null;
          return (
            <div
              className="current-group-title"
              style={{ marginBottom: "0.75rem" }}
            >
              <h2
                style={{
                  fontSize: "1.1rem",
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                Ομάδα: {label}
              </h2>
            </div>
          );
        })()}

      {/* ΛΙΣΤΕΣ – απλή λίστα όπως στο παλιό lists.php */}
      {items.length === 0 ? (
        <p>Δεν βρέθηκαν λίστες.</p>
      ) : (
        <ul
          style={{
            listStyleType: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {items.map((list) => {
            // Στυλ τίτλου: αν είναι marked, πιο έντονα / μεγαλύτερα
            const baseStyle: React.CSSProperties = {
              color: "#0070f3", // μπλε link
            };

            if (list.marked) {
              baseStyle.fontSize = "1.1rem";
              baseStyle.fontWeight = "bold";
            }

            return (
              <li key={list.id} style={{ marginBottom: "0.35rem" }}>
                <Link
                  href={`/lists/${list.id}`}
                  style={{
                    ...baseStyle,
                    textDecoration: "none",
                  }}
                >
                  {list.title || `Λίστα #${list.id}`}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Απλή σελιδοποίηση (αντίστοιχο offset/limit στο παλιό, αλλά σε σελίδες) */}
      {total > pageSize && (
        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.9rem",
          }}
        >
          <div>
            Σελίδα {page} από {Math.max(1, Math.ceil(total / pageSize))} (
            {total} λίστες)
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            {hasPrev ? (
              <Link
                href={buildPageUrl({
                  search,
                  groupId,
                  page: page - 1,
                })}
                style={{ color: "#0070f3", textDecoration: "none" }}
              >
                ← Προηγούμενη
              </Link>
            ) : (
              <span style={{ color: "#aaa" }}>← Προηγούμενη</span>
            )}

            {hasNext ? (
              <Link
                href={buildPageUrl({
                  search,
                  groupId,
                  page: page + 1,
                })}
                style={{ color: "#0070f3", textDecoration: "none" }}
              >
                Επόμενη →
              </Link>
            ) : (
              <span style={{ color: "#aaa" }}>Επόμενη →</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
