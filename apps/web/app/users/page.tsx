// app/users/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchJson } from "@/lib/api";

export const metadata: Metadata = {
  title: "Χρήστες | Repertorio Next",
  description:
    "Λίστα χρηστών του Repertorio (σελίδα διαχείρισης μόνο για διαχειριστές).",
};

type UserListItem = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string;
  createdSongsCount: number;
  createdVersionsCount: number;
};

type UsersResponse = {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type UsersPageSearchParams = {
  search?: string;
  page?: string;
  pageSize?: string;
  orderby?: string;
  order?: string;
};

function buildSortHref(
  field: "displayName" | "email" | "username" | "createdAt",
  params: {
    search: string;
    pageSize: number;
    currentOrderBy: string;
    currentOrder: string;
  }
): string {
  const { search, pageSize, currentOrderBy, currentOrder } = params;
  const qs = new URLSearchParams();

  if (search) {
    qs.set("search", search);
  }

  qs.set("page", "1"); // κάθε αλλαγή ταξινόμησης ξεκινά από την 1η σελίδα
  qs.set("pageSize", String(pageSize));
  qs.set("orderby", field);

  const nextOrder =
    currentOrderBy === field && currentOrder === "asc" ? "desc" : "asc";
  qs.set("order", nextOrder);

  return `/users?${qs.toString()}`;
}

function buildPageHref(
  page: number,
  params: {
    search: string;
    pageSize: number;
    orderby: string;
    order: string;
  }
): string {
  const { search, pageSize, orderby, order } = params;
  const qs = new URLSearchParams();

  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));

  if (search) {
    qs.set("search", search);
  }

  if (orderby) {
    qs.set("orderby", orderby);
  }

  if (order) {
    qs.set("order", order);
  }

  return `/users?${qs.toString()}`;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: UsersPageSearchParams;
}) {
  const search = (searchParams?.search ?? "").trim();
  const page = Number(searchParams?.page ?? "1") || 1;
  const pageSize = Number(searchParams?.pageSize ?? "10") || 10;
  const orderby = searchParams?.orderby ?? "displayName";
  const order = searchParams?.order ?? "asc";

  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (search) {
    qs.set("search", search);
  }
  if (orderby) {
    qs.set("orderby", orderby);
  }
  if (order) {
    qs.set("order", order);
  }

  const data = await fetchJson<UsersResponse>(`/users?${qs.toString()}`);

  if (!data.items.length) {
    return (
      <section style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "16px" }}>Χρήστες</h1>
        <p>Δεν βρέθηκαν χρήστες.</p>
      </section>
    );
  }

  return (
    <section className="users-page-wrapper">
      <h1 className="users-page-title">Χρήστες</h1>

      {/* Φόρμα αναζήτησης */}
      <form className="user-search-form" method="get" action="/users">
        <label htmlFor="search" style={{ marginRight: "8px" }}>
          Αναζήτηση:
        </label>
        <input
          type="text"
          id="search"
          name="search"
          defaultValue={search}
          placeholder="Όνομα, email ή username..."
        />
        <label htmlFor="pageSize" style={{ marginLeft: "12px" }}>
          Ανά σελίδα:
        </label>
        <select
          id="pageSize"
          name="pageSize"
          defaultValue={String(pageSize)}
          style={{ marginLeft: "4px" }}
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
        {/* Κάθε νέα αναζήτηση ξεκινά από 1η σελίδα */}
        <input type="hidden" name="page" value="1" />
        <button type="submit">Αναζήτηση</button>
      </form>

      {/* Πίνακας χρηστών */}
      <div className="users-table-wrapper">
        <table className="wp-user-list-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>
                <Link
                  href={buildSortHref("displayName", {
                    search,
                    pageSize,
                    currentOrderBy: orderby,
                    currentOrder: order,
                  })}
                >
                  Όνομα εμφάνισης
                  {orderby === "displayName" &&
                    (order === "asc" ? " ▲" : " ▼")}
                </Link>
              </th>
              <th>
                <Link
                  href={buildSortHref("username", {
                    search,
                    pageSize,
                    currentOrderBy: orderby,
                    currentOrder: order,
                  })}
                >
                  Username
                  {orderby === "username" && (order === "asc" ? " ▲" : " ▼")}
                </Link>
              </th>
              <th>
                <Link
                  href={buildSortHref("email", {
                    search,
                    pageSize,
                    currentOrderBy: orderby,
                    currentOrder: order,
                  })}
                >
                  Email
                  {orderby === "email" && (order === "asc" ? " ▲" : " ▼")}
                </Link>
              </th>
              <th>
                <Link
                  href={buildSortHref("createdAt", {
                    search,
                    pageSize,
                    currentOrderBy: orderby,
                    currentOrder: order,
                  })}
                >
                  Ημ/νία δημιουργίας
                  {orderby === "createdAt" &&
                    (order === "asc" ? " ▲" : " ▼")}
                </Link>
              </th>
              <th>Τραγούδια</th>
              <th>Εκδόσεις</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.displayName ?? "-"}</td>
                <td>{user.username ?? "-"}</td>
                <td>{user.email ?? "-"}</td>
                <td>
                  {new Date(user.createdAt).toLocaleDateString("el-GR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </td>
                <td style={{ textAlign: "center" }}>
                  {user.createdSongsCount}
                </td>
                <td style={{ textAlign: "center" }}>
                  {user.createdVersionsCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Σελιδοποίηση */}
      <div className="user-pagination">
        <span className="user-pagination-summary">
          Σελίδα {data.page} από {data.totalPages} – σύνολο {data.total} χρηστών.
        </span>

        <div className="user-pagination-links">
          {data.page > 1 && (
            <Link
              href={buildPageHref(data.page - 1, {
                search,
                pageSize,
                orderby,
                order,
              })}
            >
              « Προηγούμενη
            </Link>
          )}

          <span className="user-pagination-current">
            Σελίδα {data.page}/{data.totalPages}
          </span>

          {data.page < data.totalPages && (
            <Link
              href={buildPageHref(data.page + 1, {
                search,
                pageSize,
                orderby,
                order,
              })}
            >
              Επόμενη »
            </Link>
          )}
        </div>
      </div>

      {/* Inline CSS, αντίστοιχο με το παλιό shortcode */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
.users-page-wrapper {
  padding: 24px;
}

.users-page-title {
  font-size: 1.5rem;
  margin-bottom: 16px;
}

.user-search-form {
  margin-bottom: 20px;
}

.user-search-form input[type="text"] {
  padding: 5px;
  width: 220px;
  margin-right: 8px;
}

.user-search-form select {
  padding: 5px;
  margin-right: 8px;
}

.user-search-form button {
  padding: 6px 12px;
  cursor: pointer;
}

.users-table-wrapper {
  overflow-x: auto;
}

.wp-user-list-table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 12px;
}

.wp-user-list-table th,
.wp-user-list-table td {
  text-align: left;
  border: 1px solid #444;
  padding: 8px;
}

.wp-user-list-table th {
  background-color: #111;
}

.wp-user-list-table th a {
  text-decoration: none;
  color: #fff;
}

.wp-user-list-table th a:hover {
  text-decoration: underline;
}

.user-pagination {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}

.user-pagination-links {
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-pagination a {
  text-decoration: none;
  color: #4da3ff;
}

.user-pagination a:hover {
  text-decoration: underline;
}

.user-pagination-current {
  font-weight: bold;
}
          `,
        }}
      />
    </section>
  );
}

