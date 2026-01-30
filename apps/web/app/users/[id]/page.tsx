// apps/web/app/users/[id]/page.tsx
import type { Metadata } from "next";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi, type UserRole } from "@/lib/currentUser";
import { notFound } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { LinkButton } from "@/app/components/buttons";

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
  if (!Number.isFinite(id) || id <= 0) notFound();

  const [user, currentUser] = await Promise.all([
    fetchUser(id).catch(() => null),
    getCurrentUserFromApi().catch(() => null),
  ]);

  if (!user) notFound();

  const isAdmin = currentUser?.role === "ADMIN";
  const isSelf = !!currentUser && currentUser.id === user.id;
  const canEdit = isAdmin || isSelf;

  const createdDate = new Date(user.createdAt);
  const createdLabel = Number.isNaN(createdDate.getTime())
    ? "—"
    : createdDate.toLocaleDateString("el-GR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        left={
          <LinkButton
            href="/users"
            variant="secondary"
            title="Επιστροφή στη λίστα χρηστών"
            action="back"
          >
            Πίσω
          </LinkButton>
        }
        right={
          canEdit ? (
            <LinkButton
              href={`/users/${user.id}/edit`}
              variant="secondary"
              title="Επεξεργασία χρήστη"
              action="edit"
            >
              Επεξεργασία
            </LinkButton>
          ) : null
        }
      />

      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>
         {user.displayName || "—"}
      </h1>

      <p style={{ margin: "0 0 16px", color: "#ccc" }}>
        Δημιουργήθηκε στις {createdLabel}. Εκδόσεις: {user.createdVersionsCount} – Τραγούδια:{" "}
        {user.createdSongsCount}
      </p>

      <div
        style={{
          maxWidth: 620,
          border: "1px solid #444",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <dl style={{ margin: 0 }}>
          {[
            ["ID", String(user.id)],
            ["Username", user.username || "—"],
            ["Email", user.email || "—"],
            ["Ρόλος", formatRole(user.role)],
            // ✅ διαφορετική σειρά: πρώτα Εκδόσεις μετά Τραγούδια
            ["Εκδόσεις", String(user.createdVersionsCount)],
            ["Τραγούδια", String(user.createdSongsCount)],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid #333",
                minWidth: 0, // ✅ για να μην ξεχειλίζει σε flex
              }}
            >
              <dt
                style={{
                  fontWeight: 700,
                  color: "#ddd",
                  margin: 0,
                  flex: "0 0 auto",
                  whiteSpace: "nowrap",
                }}
              >
                {label}:
              </dt>

              <dd
                style={{
                  margin: 0,
                  color: "#fff",
                  flex: "1 1 auto",
                  minWidth: 0, // ✅ επιτρέπει ellipsis
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={value}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
