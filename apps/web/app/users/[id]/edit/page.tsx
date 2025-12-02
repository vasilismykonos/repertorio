// app/users/[id]/edit/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchJson } from "@/lib/api";
import {
  getCurrentUserFromApi,
  type UserRole,
} from "@/lib/currentUser";

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
  title: "Επεξεργασία χρήστη | Repertorio Next",
};

async function fetchUser(id: number): Promise<UserDetail> {
  return fetchJson<UserDetail>(`/users/${id}`);
}

type PageProps = {
  params: { id: string };
};

export default async function UserEditPage({ params }: PageProps) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid user id");
  }

  const [user, currentUser] = await Promise.all([
    fetchUser(id),
    getCurrentUserFromApi(),
  ]);

  const isAdmin = currentUser?.role === "ADMIN";
  const isSelf = currentUser && currentUser.id === user.id;
  const canEdit = isAdmin || isSelf;

  if (!canEdit) {
    // Δεν επιτρέπεται να κάνεις edit άλλον χρήστη
    redirect("/users");
  }

  const canEditRole = isAdmin;

  return (
    <section className="user-edit-wrapper">
      <h1 className="user-edit-title">Επεξεργασία χρήστη #{user.id}</h1>

      <p className="user-edit-subtitle">
        Δημιουργήθηκε στις{" "}
        {new Date(user.createdAt).toLocaleDateString("el-GR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })}
        . Τραγούδια: {user.createdSongsCount} – Εκδόσεις:{" "}
        {user.createdVersionsCount}
      </p>

      <form
        method="POST"
        action={`/api/users/${user.id}`}
        className="user-edit-form"
      >
        <div className="user-edit-field">
          <label htmlFor="displayName">Όνομα εμφάνισης *</label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            defaultValue={user.displayName ?? ""}
            required
          />
        </div>

        <div className="user-edit-field">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            defaultValue={user.username ?? ""}
          />
        </div>

        <div className="user-edit-field">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            defaultValue={user.email ?? ""}
          />
        </div>

        <div className="user-edit-field">
          <label htmlFor="role">Ρόλος</label>
          <select
            id="role"
            name="role"
            defaultValue={user.role}
            disabled={!canEditRole}
          >
            <option value="ADMIN">Διαχειριστής</option>
            <option value="EDITOR">Συντάκτης</option>
            <option value="AUTHOR">Συγγραφέας</option>
            <option value="CONTRIBUTOR">Συνεργάτης</option>
            <option value="SUBSCRIBER">Συνδρομητής</option>
            <option value="USER">Χρήστης</option>
          </select>
          {!canEditRole && (
            <small style={{ color: "#aaa" }}>
              Μόνο διαχειριστές μπορούν να αλλάξουν τον ρόλο.
            </small>
          )}
        </div>

        <div className="user-edit-buttons">
          <button type="submit">Αποθήκευση</button>
          <Link href={`/users/${user.id}`} className="user-edit-cancel">
            Ακύρωση
          </Link>
        </div>
      </form>

      <style
        dangerouslySetInnerHTML={{
          __html: `
.user-edit-wrapper {
  padding: 24px;
}

.user-edit-title {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.user-edit-subtitle {
  margin-bottom: 16px;
  color: #ccc;
}

.user-edit-form {
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-edit-field input,
.user-edit-field select {
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #444;
  background-color: #111;
  color: #fff;
}

.user-edit-field select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.user-edit-buttons {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-edit-buttons button {
  padding: 8px 16px;
  cursor: pointer;
}

.user-edit-cancel {
  color: #4da3ff;
  text-decoration: none;
}

.user-edit-cancel:hover {
  text-decoration: underline;
}
          `,
        }}
      />
    </section>
  );
}
