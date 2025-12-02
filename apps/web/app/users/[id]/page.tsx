// app/users/[id]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";

type UserDetail = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  createdSongsCount: number;
  createdVersionsCount: number;
};

export const metadata: Metadata = {
  title: "Προβολή χρήστη | Repertorio Next",
};

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

async function fetchUser(id: number): Promise<UserDetail> {
  return fetchJson<UserDetail>(`/users/${id}`);
}

type PageProps = {
  params: { id: string };
};

export default async function UserDetailPage({ params }: PageProps) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid user id");
  }

  // Παίρνουμε ΠΑΡΑΛΛΗΛΑ τα στοιχεία του συγκεκριμένου χρήστη
  // και του "current user" (από Google login + Nest API)
  const [user, currentUser] = await Promise.all([
    fetchUser(id),
    getCurrentUserFromApi(),
  ]);

  const isAdmin = currentUser?.role === "ADMIN";
  const isSelf = currentUser && currentUser.id === user.id;
  const canEdit = isAdmin || isSelf;

  return (
    <section className="user-detail-wrapper">
      <h1 className="user-detail-title">
        Χρήστης #{user.id} – {user.displayName || "—"}
      </h1>

      <p className="user-detail-subtitle">
        Δημιουργήθηκε στις{" "}
        {new Date(user.createdAt).toLocaleDateString("el-GR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })}
        . Τραγούδια: {user.createdSongsCount} – Εκδόσεις:{" "}
        {user.createdVersionsCount}
      </p>

      <dl className="user-detail-dl">
        <div className="user-detail-row">
          <dt>ID</dt>
          <dd>{user.id}</dd>
        </div>
        <div className="user-detail-row">
          <dt>Όνομα εμφάνισης</dt>
          <dd>{user.displayName || "—"}</dd>
        </div>
        <div className="user-detail-row">
          <dt>Username</dt>
          <dd>{user.username || "—"}</dd>
        </div>
        <div className="user-detail-row">
          <dt>Email</dt>
          <dd>{user.email || "—"}</dd>
        </div>
        <div className="user-detail-row">
          <dt>Ρόλος</dt>
          <dd>{formatRole(user.role)}</dd>
        </div>
        <div className="user-detail-row">
          <dt>Τραγούδια</dt>
          <dd>{user.createdSongsCount}</dd>
        </div>
        <div className="user-detail-row">
          <dt>Εκδόσεις</dt>
          <dd>{user.createdVersionsCount}</dd>
        </div>
      </dl>

      <div className="user-detail-buttons">
        <Link href="/users" className="user-detail-back">
          ← Επιστροφή στη λίστα
        </Link>
        {canEdit && (
          <Link
            href={`/users/${user.id}/edit`}
            className="user-detail-edit-btn"
          >
            Επεξεργασία
          </Link>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
.user-detail-wrapper {
  padding: 24px;
}

.user-detail-title {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.user-detail-subtitle {
  margin-bottom: 16px;
  color: #ccc;
}

.user-detail-dl {
  max-width: 480px;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 16px;
}

.user-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
  border-bottom: 1px solid #333;
}

.user-detail-row:last-child {
  border-bottom: none;
}

.user-detail-row dt {
  font-weight: bold;
  min-width: 140px;
}

.user-detail-row dd {
  margin: 0;
  text-align: right;
}

.user-detail-buttons {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-detail-back,
.user-detail-edit-btn {
  text-decoration: none;
  padding: 8px 14px;
  border-radius: 4px;
}

.user-detail-back {
  background-color: #222;
  color: #fff;
}

.user-detail-edit-btn {
  background-color: #4da3ff;
  color: #000;
}
          `,
        }}
      />
    </section>
  );
}
