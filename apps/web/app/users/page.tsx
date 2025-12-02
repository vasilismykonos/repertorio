// app/users/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

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
  role: UserRole;
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
  },
): string {
  const { search, pageSize, currentOrderBy, currentOrder } = params;
  const qs = new URLSearchParams();

  if (search) {
    qs.set("search", search);
  }

  qs.set("page", "1"); // κάθε αλλαγή ταξινόμησης ξεκινά από την 1η σελ
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
  },
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

function formatRole(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Διαχειριστής";
    case "EDITOR":
      return "Συντάκτης";
    case "AUTHOR":
      return "Συγγραφέας";
    case "CONTRIBUTOR":
      return "Συνεργάτης";
    case "SUBSCRIBER":
      return "Συνδρομητής";
    case "USER":
    default:
      return "Χρήστης";
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: UsersPageSearchParams;
}) {
  // --- ΤΡΕΧΩΝ ΧΡΗΣΤΗΣ ΑΠΟ GOOGLE LOGIN + NEST API ---
  const currentUser = await getCurrentUserFromApi();
  const isAdmin = currentUser?.role === "ADMIN";

  // --- ΠΑΡΑΜΕΤΡΟΙ ΛΙΣΤΑΣ ---
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
  const { items, totalPages } = data;

  const pages: number[] = [];
  for (let p = 1; p <= totalPages; p++) {
    pages.push(p);
  }

  const columnCount = isAdmin ? 9 : 8;

  return (
    <section className="users-page-wrapper">
      <h1 className="users-page-title">Χρήστες</h1>

      {/* Φόρμα αναζήτησης / ταξινόμησης */}
      <form method="GET" className="user-search-form">
        <label>
          Αναζήτηση:&nbsp;
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Όνομα, username ή email"
          />
        </label>

        <label>
          Ανά σελίδα:&nbsp;
          <select name="pageSize" defaultValue={String(pageSize)}>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </label>

        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="orderby" value={orderby} />
        <input type="hidden" name="order" value={order} />

        <button type="submit">Αναζήτηση</button>
      </form>

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
                  {orderby === "username" &&
                    (order === "asc" ? " ▲" : " ▼")}
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
              <th>Ρόλος</th>
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
              {isAdmin && <th>Ενέργειες</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  style={{ textAlign: "center", padding: "12px" }}
                >
                  Δεν βρέθηκαν χρήστες.
                </td>
              </tr>
            ) : (
              items.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>
                    {/* Κλικ στο όνομα → σελίδα προβολής /users/[id] */}
                    <Link href={`/users/${user.id}`}>
                      {user.displayName || "—"}
                    </Link>
                  </td>
                  <td>{user.username || "—"}</td>
                  <td>{user.email || "—"}</td>
                  <td>
                    <span className="user-role-badge">
                      {formatRole(user.role)}
                    </span>
                  </td>
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
                  {isAdmin && (
                    <td>
                      <Link href={`/users/${user.id}/edit`}>Επεξεργασία</Link>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="user-pagination">
          <span>Σελίδα:</span>
          {pages.map((p) =>
            p === page ? (
              <span key={p} className="user-pagination-current">
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={buildPageHref(p, {
                  search,
                  pageSize,
                  orderby,
                  order,
                })}
              >
                {p}
              </Link>
            ),
          )}
        </div>
      )}

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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.user-search-form input[type="text"] {
  padding: 4px 8px;
}

.user-search-form select {
  padding: 4px 8px;
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
  color: #fff;
}

.user-role-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  background-color: #333;
  color: #fff;
}

.user-pagination {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
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
