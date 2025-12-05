// app/users/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  avatarUrl?: string | null;
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

function normalizeOrderby(orderby: string | undefined): string {
  const allowed = [
    "id",
    "displayName",
    "username",
    "email",
    "role",
    "createdAt",
    "createdSongsCount",
    "createdVersionsCount",
  ];

  if (!orderby || !allowed.includes(orderby)) {
    return "displayName";
  }

  return orderby;
}

function normalizeOrder(order: string | undefined): "asc" | "desc" {
  if (order === "desc") return "desc";
  return "asc";
}

function buildSortHref(
  field: string,
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

  qs.set("page", "1");
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
  qs.set("orderby", orderby);
  qs.set("order", order);

  return `/users?${qs.toString()}`;
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

function formatRoleLabel(role: UserRole): string {
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
  // Session από NextAuth (Google image για logged-in user)
  const session = await getServerSession(authOptions);
  const sessionEmail =
    session?.user?.email ? session.user.email.toLowerCase() : null;
  const sessionImage =
    (session?.user as any)?.image &&
    typeof (session?.user as any).image === "string"
      ? ((session?.user as any).image as string)
      : null;

  // Τρέχων χρήστης από Nest API (για έλεγχο ρόλου)
  const currentUser = await getCurrentUserFromApi();
  const isAdmin = currentUser?.role === "ADMIN";

  // Query params
  const search = (searchParams?.search ?? "").trim();
  const page = Number(searchParams?.page ?? "1") || 1;
  const pageSize = Number(searchParams?.pageSize ?? "10") || 10;
  const orderby = normalizeOrderby(searchParams?.orderby);
  const order = normalizeOrder(searchParams?.order);

  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (search) {
    qs.set("search", search);
  }
  qs.set("sort", orderby);
  qs.set("order", order);

  const url = `/users?${qs.toString()}`;

  const data = await fetchJson<UsersResponse>(url);

  const items = data.items ?? [];
  const total = data.total ?? 0;
  const totalPages = data.totalPages ?? 1;

  // Στήλες: ID, Avatar, Όνομα, Username, Email, Ρόλος, Ημ/νία, Τραγούδια, Εκδόσεις, [Ενέργειες]
  const columnCount = isAdmin ? 10 : 9;

  return (
    <section className="users-page-wrapper">
      <h1 className="users-page-title">Χρήστες</h1>

      {!currentUser && (
        <div className="user-not-logged">
          Πρέπει να συνδεθείτε για να δείτε τη σελίδα χρηστών.{" "}
          <a href="/api/auth/signin">Μετάβαση στη σελίδα σύνδεσης</a>
        </div>
      )}

      {currentUser && !isAdmin && (
        <div className="user-not-admin">
          Δεν έχετε δικαίωμα πρόσβασης στη σελίδα χρηστών (απαιτείται ρόλος
          Διαχειριστή).
        </div>
      )}

      {currentUser && isAdmin && (
        <>
          <form className="user-search-form" action="/users" method="get">
            <label>
              Αναζήτηση:&nbsp;
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Όνομα, email ή username"
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
                  <th>
                    <Link
                      href={buildSortHref("id", {
                        search,
                        pageSize,
                        currentOrderBy: orderby,
                        currentOrder: order,
                      })}
                    >
                      ID
                      {orderby === "id" && (order === "asc" ? " ▲" : " ▼")}
                    </Link>
                  </th>
                  <th>Avatar</th>
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
                      {orderby === "email" &&
                        (order === "asc" ? " ▲" : " ▼")}
                    </Link>
                  </th>
                  <th>
                    <Link
                      href={buildSortHref("role", {
                        search,
                        pageSize,
                        currentOrderBy: orderby,
                        currentOrder: order,
                      })}
                    >
                      Ρόλος
                      {orderby === "role" &&
                        (order === "asc" ? " ▲" : " ▼")}
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
                  <th>
                    <Link
                      href={buildSortHref("createdSongsCount", {
                        search,
                        pageSize,
                        currentOrderBy: orderby,
                        currentOrder: order,
                      })}
                    >
                      Τραγούδια
                      {orderby === "createdSongsCount" &&
                        (order === "asc" ? " ▲" : " ▼")}
                    </Link>
                  </th>
                  <th>
                    <Link
                      href={buildSortHref("createdVersionsCount", {
                        search,
                        pageSize,
                        currentOrderBy: orderby,
                        currentOrder: order,
                      })}
                    >
                      Εκδόσεις
                      {orderby === "createdVersionsCount" &&
                        (order === "asc" ? " ▲" : " ▼")}
                    </Link>
                  </th>
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
                  items.map((user) => {
                    let avatarSrc: string | null = user.avatarUrl ?? null;

                    // Αν είναι ο τρέχων logged-in και έχουμε Google image από session,
                    // δίνουμε προτεραιότητα σε αυτήν.
                    if (
                      !avatarSrc &&
                      sessionEmail &&
                      sessionImage &&
                      user.email &&
                      user.email.toLowerCase() === sessionEmail
                    ) {
                      avatarSrc = sessionImage;
                    }

                    const fallbackText =
                      (user.displayName ||
                        user.username ||
                        user.email ||
                        "?")?.charAt(0).toUpperCase() || "?";

                    const songsHref = `/songs?createdByUserId=${user.id}`;
                    const versionsHref = `/versions?createdByUserId=${user.id}`;

                    return (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt={user.displayName || user.email || "User"}
                              className="user-avatar"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="user-avatar user-avatar-fallback">
                              {fallbackText}
                            </div>
                          )}
                        </td>
                        <td>
                          <Link href={`/users/${user.id}`}>
                            {user.displayName || "—"}
                          </Link>
                        </td>
                        <td>{user.username || "—"}</td>
                        <td>{user.email || "—"}</td>
                        <td>{formatRoleLabel(user.role)}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>
                          {user.createdSongsCount > 0 ? (
                            <Link href={songsHref}>
                              {user.createdSongsCount}
                            </Link>
                          ) : (
                            user.createdSongsCount
                          )}
                        </td>
                        <td>
                          {user.createdVersionsCount > 0 ? (
                            <Link href={versionsHref}>
                              {user.createdVersionsCount}
                            </Link>
                          ) : (
                            user.createdVersionsCount
                          )}
                        </td>
                        {isAdmin && (
                          <td>
                            <Link href={`/users/${user.id}/edit`}>
                              Επεξεργασία
                            </Link>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="user-pagination">
            {page > 1 && (
              <Link
                href={buildPageHref(page - 1, {
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
              Σελίδα {page} από {totalPages} (σύνολο {total} χρήστες)
            </span>

            {page < totalPages && (
              <Link
                href={buildPageHref(page + 1, {
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
        </>
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

.user-not-logged,
.user-not-admin {
  padding: 12px;
  background-color: #441111;
  border: 1px solid #aa4444;
  border-radius: 4px;
  margin-bottom: 16px;
}

.user-not-logged a {
  color: #ffccaa;
  text-decoration: underline;
}

.user-search-form {
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.user-search-form input[type="text"] {
  padding: 4px 8px;
}

.user-search-form select {
  padding: 4px 8px;
}

.user-search-form button {
  padding: 4px 12px;
  cursor: pointer;
}

.users-table-wrapper {
  overflow-x: auto;
}

.wp-user-list-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}

.wp-user-list-table th,
.wp-user-list-table td {
  border-bottom: 1px solid #333;
  padding: 8px;
  text-align: left;
}

.wp-user-list-table th {
  cursor: pointer;
  user-select: none;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.user-avatar-fallback {
  background-color: #444;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.user-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
}

.user-pagination a {
  text-decoration: none;
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
