// apps/web/app/users/[id]/edit/UserEditPageClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import type { UserRole } from "@/lib/currentUser";

type UserDetail = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
};

type Props = {
  user: UserDetail;
  canEditRole: boolean;
};

export default function UserEditPageClient({ user, canEditRole }: Props) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [role, setRole] = useState<UserRole>(user.role);

  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = saving || isDeleting;
  const roleDisabled = !canEditRole;

  const labelStyle: React.CSSProperties = {
    color: "#ddd",
    fontWeight: 600,
  };

  const helpStyle: React.CSSProperties = {
    color: "#aaa",
    fontSize: 12,
    lineHeight: 1.3,
  };

  const payload = useMemo(() => {
    return {
      displayName: displayName.trim() || null,
      role,
    };
  }, [displayName, role]);

  async function onSaveClick() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Save failed (${res.status})`);
      }

      router.push(`/users/${user.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  }

  function onCancelClick() {
    router.push(`/users/${user.id}`);
  }

  async function onDeleteClick() {
    setError(null);

    const ok = window.confirm(
      "Θέλεις σίγουρα να διαγράψεις τον χρήστη; Η ενέργεια δεν αναιρείται.",
    );
    if (!ok) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Delete failed (${res.status})`);
      }

      router.push("/users");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Αποτυχία διαγραφής");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <ActionBar
        left={A.backLink({
          href: `/users/${user.id}`,
          title: "Πίσω στον χρήστη",
          disabled: busy,
        })}
        right={
          <>
            {A.save({
              disabled: busy,
              loading: saving,
              onClick: onSaveClick,
              title: "Αποθήκευση",
            })}

            {A.cancel({
              disabled: busy,
              onClick: onCancelClick,
              title: "Άκυρο",
            })}

            {A.del({
              disabled: busy,
              loading: isDeleting,
              onClick: onDeleteClick,
              title: "Διαγραφή χρήστη",
            })}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16, color: "#fff" }}>
        Επεξεργασία χρήστη #{user.id}
      </h1>

      {error ? (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            border: "1px solid #b00020",
            borderRadius: 8,
            color: "#ffd0d0",
            background: "#241010",
          }}
        >
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSaveClick();
        }}
        style={{
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="displayName" style={labelStyle}>
            Όνομα εμφάνισης *
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            disabled={busy}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#111",
              color: "#fff",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={labelStyle}>Username</label>
          <input
            value={user.username ?? ""}
            readOnly
            disabled
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#111",
              color: "#aaa",
              opacity: 0.85,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={labelStyle}>Email</label>
          <input
            value={user.email ?? ""}
            readOnly
            disabled
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#111",
              color: "#aaa",
              opacity: 0.85,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="role" style={labelStyle}>
            Ρόλος
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={busy || roleDisabled}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#111",
              color: "#fff",
              opacity: roleDisabled ? 0.7 : 1,
            }}
          >
            <option value="ADMIN">Διαχειριστής</option>
            <option value="EDITOR">Συντάκτης</option>
            <option value="AUTHOR">Συγγραφέας</option>
            <option value="CONTRIBUTOR">Συνεργάτης</option>
            <option value="SUBSCRIBER">Συνδρομητής</option>
            <option value="USER">Χρήστης</option>
          </select>

          {!canEditRole ? (
            <small style={helpStyle}>
              Μόνο διαχειριστές μπορούν να αλλάξουν τον ρόλο.
            </small>
          ) : null}
        </div>
      </form>
    </>
  );
}
