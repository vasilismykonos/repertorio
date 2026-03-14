// apps/web/app/lists/groups/shared/GroupShareSection.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";

import { searchUsers } from "@/lib/users/searchUsers";
import type { UserPick } from "@/lib/users/types";

import { Crown, Eye, Shield, Plus, X } from "lucide-react";

/* =========================
   Types
========================= */

type GroupRole = "OWNER" | "LIST_EDITOR" | "VIEWER";

type MemberDto = {
  userId: number;
  role: GroupRole;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
};

type AddRole = Exclude<GroupRole, "OWNER">; // ✅ no second owner
type EditableRole = Exclude<GroupRole, "OWNER">;

/* =========================
   Helpers
========================= */

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function memberDisplay(m: Pick<MemberDto, "displayName" | "username" | "email">): string {
  const dn = (m.displayName || "").trim();
  const un = (m.username || "").trim();
  const em = (m.email || "").trim();
  return dn || un || em || "Χρήστης";
}

function memberSubline(m: Pick<MemberDto, "username" | "email" | "userId">): string {
  const parts: string[] = [];
  if (m.username) parts.push(`@${m.username}`);
  if (m.email) parts.push(m.email);
  if (parts.length === 0) parts.push(`User #${m.userId}`);
  return parts.join(" • ");
}

type RoleTone = "gold" | "blue" | "gray";

function roleMeta(role: GroupRole): {
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: RoleTone;
} {
  switch (role) {
    case "OWNER":
      return {
        label: "Δημιουργός",
        hint: "Ορίζει δικαιώματα & διαχειρίζεται την ομάδα και τα μέλη.",
        icon: <Crown size={16} />,
        tone: "gold",
      };
    case "LIST_EDITOR":
      return {
        label: "Διαχειριστής",
        hint: "Μπορεί να διαχειρίζεται μέλη της ομάδας.",
        icon: <Shield size={16} />,
        tone: "blue",
      };
    default:
      return {
        label: "Χρήστης",
        hint: "Μπορεί να βλέπει την ομάδα.",
        icon: <Eye size={16} />,
        tone: "gray",
      };
  }
}

function roleLabel(role: GroupRole): string {
  return roleMeta(role).label;
}

function toneStyle(tone: RoleTone): React.CSSProperties {
  if (tone === "gold") {
    return {
      border: "1px solid rgba(255,215,120,0.34)",
      background: "rgba(255,215,120,0.10)",
    };
  }
  if (tone === "blue") {
    return {
      border: "1px solid rgba(120,185,255,0.28)",
      background: "rgba(120,185,255,0.08)",
    };
  }
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.05)",
  };
}

function RoleChip({ role }: { role: GroupRole }) {
  const meta = roleMeta(role);
  return (
    <span
      title={meta.hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        color: "#fff",
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        ...toneStyle(meta.tone),
      }}
    >
      <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95 }}>
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

/* =========================
   Role pickers
========================= */

function SegAddRolePicker({
  value,
  onChange,
  disabled,
}: {
  value: AddRole;
  onChange: (r: AddRole) => void;
  disabled: boolean;
}) {
  const opts: { value: AddRole; role: GroupRole }[] = [
    { value: "VIEWER", role: "VIEWER" },
    { value: "LIST_EDITOR", role: "LIST_EDITOR" },
  ];

  return (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.88, paddingLeft: 2 }}>Δικαιώματα</div>

      <div
        role="radiogroup"
        aria-label="Δικαιώματα μέλους"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: 5,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.18)",
          height: 44,
          boxSizing: "border-box",
        }}
      >
        {opts.map((o) => {
          const active = value === o.value;
          const meta = roleMeta(o.role);

          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              title={meta.hint}
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: 12,
                border: active ? "1px solid rgba(255,255,255,0.38)" : "1px solid rgba(255,255,255,0.16)",
                background: active ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
                color: "#fff",
                fontSize: 13,
                fontWeight: active ? 950 : 850,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                userSelect: "none",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95 }}>
                {meta.icon}
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoleDropdown({
  value,
  disabled,
  onChange,
}: {
  value: EditableRole;
  disabled: boolean;
  onChange: (r: EditableRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const opts: EditableRole[] = ["LIST_EDITOR", "VIEWER"];

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = boxRef.current;
      if (!el) return;
      if (!el.contains(e.target as any)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const current = roleMeta(value);

  return (
    <div ref={boxRef} style={{ position: "relative", width: "max-content", maxWidth: "100%" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        title={current.hint}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: "max-content",
          maxWidth: "100%",
          height: 44,
          padding: "0 38px 0 12px",
          borderRadius: 14,
          outline: "none",
          boxSizing: "border-box",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 10,

          ...toneStyle(current.tone),

          color: "#fff",
          fontWeight: 950,
          fontSize: 14,
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95 }}>
          {current.icon}
        </span>
        <span>{current.label}</span>

        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "#fff",
            opacity: 0.75,
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 48,
            left: 0,
            zIndex: 2000,
            width: "max-content",
            minWidth: "100%",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(20,20,20,0.98)",
            boxShadow: "0 14px 34px rgba(0,0,0,0.50)",
            padding: 8,
            display: "grid",
            gap: 8,
          }}
        >
          {opts.map((r) => {
            const meta = roleMeta(r);
            const active = r === value;

            return (
              <button
                key={r}
                role="menuitemradio"
                aria-checked={active}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChange(r);
                }}
                title={meta.hint}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  alignItems: "start",
                  justifyContent: "flex-start",
                  columnGap: 10,
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  userSelect: "none",

                  ...toneStyle(meta.tone),

                  boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.28) inset" : "none",
                }}
              >
                <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95, marginTop: 1 }}>
                  {meta.icon}
                </span>

                <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 950, fontSize: 13, color: "#fff", whiteSpace: "nowrap" }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.82, color: "#fff" }}>{meta.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* =========================
   Component
========================= */

export default function GroupShareSection(props: { groupId: number; groupRole: GroupRole | null }) {
  const { groupId, groupRole } = props;

  const canManageMembers = groupRole === "OWNER";

  const [members, setMembers] = useState<MemberDto[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersErr, setMembersErr] = useState<string | null>(null);

  // ✅ NEW: collapsed add
  const [addOpen, setAddOpen] = useState(false);

  const [addMemberQuery, setAddMemberQuery] = useState<string>("");
  const [addMemberRole, setAddMemberRole] = useState<AddRole>("VIEWER");

  const [userSug, setUserSug] = useState<UserPick[]>([]);
  const [userSugOpen, setUserSugOpen] = useState(false);
  const [userSugLoading, setUserSugLoading] = useState(false);
  const [userSugErr, setUserSugErr] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<UserPick | null>(null);

  const userSugReqSeq = useRef(0);
  const userSugDebounceRef = useRef<number | null>(null);
  const addBoxRef = useRef<HTMLDivElement | null>(null);

  /* ---------- styles ---------- */

  const cardStyle: React.CSSProperties = useMemo(
    () => ({
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 14,
      padding: 14,
      background: "rgba(255,255,255,0.04)",
      color: "#fff",
      marginBottom: 12,
      overflowX: "hidden",
    }),
    [],
  );

  const subCardStyle: React.CSSProperties = useMemo(
    () => ({
      marginTop: 12,
      padding: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(0,0,0,0.18)",
      overflowX: "hidden",
    }),
    [],
  );

  const compactAStyle: React.CSSProperties = useMemo(
    () => ({
      height: 44,
      padding: "0 14px",
      borderRadius: 14,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      whiteSpace: "nowrap",
    }),
    [],
  );

  const inputStyle: React.CSSProperties = useMemo(
    () => ({
      width: "100%",
      height: 44,
      padding: "0 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "#ffffff",
      color: "#000000",
      outline: "none",
      fontSize: 15,
      boxSizing: "border-box",
    }),
    [],
  );

  /* ---------- derived ---------- */

  const memberRoleById = useMemo(() => {
    const m = new Map<number, MemberDto["role"]>();
    for (const it of members) m.set(Number(it.userId), it.role);
    return m;
  }, [members]);

  const memberEmailSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of members) {
      const em = (it.email || "").trim().toLowerCase();
      if (em) s.add(em);
    }
    return s;
  }, [members]);

  function isAlreadyMemberById(userId: number | null | undefined): MemberDto["role"] | null {
    if (!userId) return null;
    return memberRoleById.get(Number(userId)) ?? null;
  }

  function isAlreadyMemberByEmail(email: string | null | undefined): boolean {
    const em = (email || "").trim().toLowerCase();
    if (!em) return false;
    return memberEmailSet.has(em);
  }

  const selectedIsAlreadyMember = useMemo(() => {
    return !!(selectedUser?.id && isAlreadyMemberById(selectedUser.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, memberRoleById]);

  const disabledAdd = useMemo(() => {
    return (
      !canManageMembers ||
      membersLoading ||
      selectedIsAlreadyMember ||
      (!selectedUser && addMemberQuery.trim().length < 2)
    );
  }, [addMemberQuery, canManageMembers, membersLoading, selectedIsAlreadyMember, selectedUser]);

  /* ---------- API actions ---------- */

  async function loadMembers() {
    setMembersErr(null);
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/lists/groups/${groupId}/members`, { cache: "no-store" });
      const body = await readJson(res);

      if (!res.ok) {
        const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
        setMembersErr(String(msg));
        setMembers([]);
        return;
      }

      const items = Array.isArray((body as any)?.items) ? (body as any).items : [];
      setMembers(items as MemberDto[]);
    } catch (e: any) {
      setMembersErr(String(e?.message || e || "Failed"));
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  async function upsertMember(payload: any) {
    if (!canManageMembers) return;

    setMembersErr(null);
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/lists/groups/${groupId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const body = await readJson(res);

      if (!res.ok) {
        const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
        setMembersErr(String(msg));
        return;
      }

      const items = Array.isArray((body as any)?.items) ? (body as any).items : [];
      setMembers(items as MemberDto[]);

      // reset add form + close
      setAddMemberQuery("");
      setSelectedUser(null);
      setUserSug([]);
      setUserSugOpen(false);
      setAddMemberRole("VIEWER");
      setAddOpen(false); // ✅ close like Lists
    } catch (e: any) {
      setMembersErr(String(e?.message || e || "Failed"));
    } finally {
      setMembersLoading(false);
    }
  }

  async function deleteMember(memberUserId: number) {
    if (!canManageMembers) return;

    setMembersErr(null);
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/lists/groups/${groupId}/members/${memberUserId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const body = await readJson(res);

      if (!res.ok) {
        const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
        setMembersErr(String(msg));
        return;
      }

      const items = Array.isArray((body as any)?.items) ? (body as any).items : [];
      setMembers(items as MemberDto[]);
    } catch (e: any) {
      setMembersErr(String(e?.message || e || "Failed"));
    } finally {
      setMembersLoading(false);
    }
  }

  async function onAddMember() {
    if (!canManageMembers) return;

    if (selectedUser?.id) {
      const roleExisting = isAlreadyMemberById(selectedUser.id);
      if (roleExisting) {
        setMembersErr(`Ο χρήστης είναι ήδη μέλος (${roleLabel(roleExisting)}).`);
        return;
      }
      await upsertMember({ memberUserId: selectedUser.id, role: addMemberRole });
      return;
    }

    const raw = addMemberQuery.trim();

    const asId = Number(raw);
    if (Number.isFinite(asId) && Number.isInteger(asId) && asId > 0) {
      const roleExisting = isAlreadyMemberById(asId);
      if (roleExisting) {
        setMembersErr(`Ο χρήστης είναι ήδη μέλος (${roleLabel(roleExisting)}).`);
        return;
      }
      await upsertMember({ memberUserId: asId, role: addMemberRole });
      return;
    }

    if (raw.includes("@")) {
      if (isAlreadyMemberByEmail(raw)) {
        setMembersErr("Το email είναι ήδη μέλος της ομάδας.");
        return;
      }
      await upsertMember({ email: raw, role: addMemberRole });
      return;
    }

    setMembersErr("Διάλεξε χρήστη από την αναζήτηση ή βάλε έγκυρο email.");
  }

  function onPickUser(u: UserPick) {
    const roleExisting = isAlreadyMemberById(u.id);
    if (roleExisting) return;

    setSelectedUser(u);
    setAddMemberQuery(u.displayName || u.username || "Χρήστης");
    setUserSugOpen(false);
    setUserSug([]);
    setUserSugErr(null);
  }

  function clearPickedUser() {
    setSelectedUser(null);
    setAddMemberQuery("");
    setUserSug([]);
    setUserSugOpen(false);
    setUserSugErr(null);
  }

  /* ---------- effects ---------- */

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // click-outside closes suggestions
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = addBoxRef.current;
      if (!el) return;
      if (!el.contains(e.target as any)) setUserSugOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // search debounce (only when addOpen)
  useEffect(() => {
    if (!canManageMembers) {
      setUserSugOpen(false);
      return;
    }
    if (!addOpen) {
      setUserSugOpen(false);
      return;
    }

    const q = addMemberQuery.trim();
    if (selectedUser) return;

    if (!q || q.length < 2) {
      setUserSug([]);
      setUserSugOpen(false);
      setUserSugErr(null);
      setUserSugLoading(false);
      return;
    }

    if (userSugDebounceRef.current) {
      window.clearTimeout(userSugDebounceRef.current);
      userSugDebounceRef.current = null;
    }

    const seq = ++userSugReqSeq.current;

    userSugDebounceRef.current = window.setTimeout(async () => {
      setUserSugErr(null);
      setUserSugLoading(true);

      try {
        const items = await searchUsers(q, 8);
        if (seq !== userSugReqSeq.current) return;

        setUserSug(items);
        setUserSugOpen(true);
      } catch (e: any) {
        if (seq !== userSugReqSeq.current) return;
        setUserSug([]);
        setUserSugOpen(true);
        setUserSugErr(String(e?.message || e || "Search failed"));
      } finally {
        if (seq === userSugReqSeq.current) setUserSugLoading(false);
      }
    }, 250);

    return () => {
      if (userSugDebounceRef.current) {
        window.clearTimeout(userSugDebounceRef.current);
        userSugDebounceRef.current = null;
      }
    };
  }, [addMemberQuery, canManageMembers, selectedUser, addOpen]);

  /* ---------- render ---------- */

  return (
    <>
      <style jsx global>{`
        .grp-add-row {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) auto auto;
          gap: 12px;
          align-items: end;
          min-width: 0;
        }

        @media (max-width: 820px) {
          .grp-add-row {
            grid-template-columns: 1fr !important;
          }
          .grp-add-actions {
            justify-content: flex-end !important;
          }
        }

        .grp-share-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 10px;
          align-items: center;
          min-width: 0;
        }

        @media (max-width: 640px) {
          .grp-share-row {
            grid-template-columns: 1fr !important;
          }
          .grp-share-actions {
            justify-content: flex-end !important;
          }
        }

        .grp-user-sug,
        .grp-user-sug * {
          color: #000 !important;
        }
        .grp-user-sug svg {
          color: #000 !important;
          stroke: #000 !important;
          fill: #000 !important;
        }
      `}</style>

      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>
              Κοινή χρήση ομάδας{" "}
              <span style={{ opacity: 0.7, fontWeight: 800, fontSize: 12 }}>
                ({groupRole ? roleLabel(groupRole) : ""})
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {A.refresh({
              onClick: loadMembers,
              disabled: membersLoading,
              title: "Ανανέωση",
              label: "Ανανέωση",
              style: { height: 36, borderRadius: 12, padding: "0 12px" },
            })}

            {/* ✅ Add toggle with + */}
            <button
              type="button"
              onClick={() => {
                if (!canManageMembers) return;
                setAddOpen((v) => !v);
                setUserSugOpen(false);
              }}
              disabled={!canManageMembers || membersLoading}
              title={addOpen ? "Κλείσιμο" : "Προσθήκη μέλους"}
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.16)",
                background: addOpen ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.16)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: !canManageMembers || membersLoading ? "not-allowed" : "pointer",
                opacity: !canManageMembers || membersLoading ? 0.6 : 1,
              }}
              aria-expanded={addOpen}
            >
              {addOpen ? <X size={18} /> : <Plus size={18} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {membersErr ? (
          <div
            style={{
              marginTop: 12,
              border: "1px solid rgba(255,80,80,0.35)",
              background: "rgba(255,80,80,0.10)",
              padding: "10px 12px",
              borderRadius: 12,
              color: "#fff",
              fontSize: 13,
            }}
          >
            <strong>Σφάλμα:</strong> {membersErr}
          </div>
        ) : null}

        {/* Add member card (collapsed) */}
        {addOpen ? (
          <div style={subCardStyle}>
            <div className="grp-add-row" ref={addBoxRef}>
              {/* Search input + suggestions */}
              <div style={{ position: "relative", display: "grid", gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.88, paddingLeft: 2 }}>Προσθήκη μέλους</div>

                <input
                  value={addMemberQuery}
                  onChange={(e) => {
                    setAddMemberQuery(e.target.value);
                    setSelectedUser(null);
                    setUserSugOpen(true);
                  }}
                  onFocus={() => {
                    if (canManageMembers) setUserSugOpen(true);
                  }}
                  placeholder="Αναζήτηση χρήστη (όνομα, username, email)…"
                  disabled={!canManageMembers || membersLoading}
                  style={inputStyle}
                />

                {selectedUser ? (
                  <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, opacity: 0.85 }}>
                      Επιλεγμένος:{" "}
                      <strong style={{ opacity: 1 }}>
                        {selectedUser.displayName || selectedUser.username || "Χρήστης"}
                      </strong>
                      {isAlreadyMemberById(selectedUser.id) ? (
                        <span style={{ marginLeft: 8, opacity: 0.9, fontWeight: 900 }}>
                          (Ήδη μέλος: {roleLabel(isAlreadyMemberById(selectedUser.id)!)} )
                        </span>
                      ) : null}
                    </span>

                    {A.cancel({
                      onClick: clearPickedUser,
                      disabled: !canManageMembers || membersLoading,
                      title: "Καθαρισμός",
                      label: "Καθαρισμός",
                      iconOnly: true,
                      style: { height: 30, padding: "0 10px", borderRadius: 999 },
                    })}
                  </div>
                ) : null}

                {canManageMembers && userSugOpen ? (
                  <div
                    className="grp-user-sug"
                    style={{
                      position: "absolute",
                      top: selectedUser ? 112 : 74,
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.18)",
                      background: "#ffffff",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid rgba(0,0,0,0.10)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        background: "#ffffff",
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>
                        {userSugLoading
                          ? "Αναζήτηση…"
                          : userSugErr
                            ? `Σφάλμα: ${userSugErr}`
                            : "Επίλεξε χρήστη"}
                      </div>

                      {A.cancel({
                        onClick: () => setUserSugOpen(false),
                        title: "Κλείσιμο",
                        iconOnly: true,
                        style: {
                          height: 30,
                          padding: "0 10px",
                          borderRadius: 999,
                          background: "rgba(0,0,0,0.06)",
                          border: "1px solid rgba(0,0,0,0.14)",
                          color: "#000",
                        },
                      })}
                    </div>

                    <div style={{ maxHeight: 260, overflowY: "auto", overflowX: "hidden" }}>
                      {!userSugLoading && !userSugErr && userSug.length === 0 ? (
                        <div style={{ padding: "10px 12px", fontSize: 13, opacity: 0.75 }}>
                          Δεν βρέθηκαν χρήστες.
                        </div>
                      ) : null}

                      {userSug.map((u, idx) => {
                        const label = u.displayName || u.username || "Χρήστης";
                        const existingRole = isAlreadyMemberById(u.id);
                        const disabledPick = !!existingRole || membersLoading;

                        return (
                          <Button
                            key={u.id}
                            type="button"
                            variant="ghost"
                            size="md"
                            action="none"
                            showLabel
                            onClick={() => {
                              if (disabledPick) return;
                              onPickUser(u);
                            }}
                            disabled={disabledPick}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              border: "none",
                              borderBottom: idx === userSug.length - 1 ? "none" : "1px solid rgba(0,0,0,0.08)",
                              background: "#ffffff",
                              color: "#000000",
                              cursor: disabledPick ? "not-allowed" : "pointer",
                              borderRadius: 0,
                              opacity: disabledPick ? 0.65 : 1,
                            }}
                            title={existingRole ? `${label} (Ήδη μέλος: ${roleLabel(existingRole)})` : label}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div
                                style={{
                                  fontWeight: 900,
                                  fontSize: 14,
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {label}
                              </div>

                              {existingRole ? (
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 900,
                                    padding: "6px 8px",
                                    borderRadius: 999,
                                    border: "1px solid rgba(0,0,0,0.14)",
                                    background: "rgba(0,0,0,0.06)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {roleLabel(existingRole)}
                                </span>
                              ) : null}
                            </div>

                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                              {u.username ? `@${u.username}` : "—"}
                              {existingRole ? " • Ήδη μέλος" : ""}
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Role picker (no OWNER) */}
              <SegAddRolePicker
                value={addMemberRole}
                onChange={setAddMemberRole}
                disabled={!canManageMembers || membersLoading}
              />

              {/* Add action */}
              <div className="grp-add-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
                {A.add({
                  onClick: onAddMember,
                  disabled: disabledAdd,
                  title: selectedIsAlreadyMember ? "Ο χρήστης είναι ήδη μέλος" : "Προσθήκη",
                  label: "Προσθήκη",
                  style: compactAStyle,
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Members list */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 13, opacity: 0.9, marginBottom: 8 }}>Μέλη ({members.length})</div>

          {membersLoading ? <div style={{ opacity: 0.8 }}>Φόρτωση…</div> : null}

          {members.length === 0 && !membersLoading ? (
            <div style={{ opacity: 0.8, fontSize: 13 }}>Δεν υπάρχουν μέλη.</div>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            {members.map((m) => {
              const isOwner = m.role === "OWNER";
              const canChangeRow = canManageMembers && !isOwner;

              return (
                <div
                  key={m.userId}
                  className="grp-share-row"
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {memberDisplay(m)}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{memberSubline(m)}</div>
                  </div>

                  {isOwner ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
                      <RoleChip role="OWNER" />
                    </div>
                  ) : (
                    <RoleDropdown
                      value={m.role as EditableRole}
                      disabled={!canChangeRow || membersLoading}
                      onChange={(r) => upsertMember({ memberUserId: m.userId, role: r })}
                    />
                  )}

                  <div className="grp-share-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
                    {A.del({
                      onClick: () => deleteMember(m.userId),
                      disabled: membersLoading || !canManageMembers || isOwner,
                      title: isOwner ? "Δεν μπορείς να αφαιρέσεις τον Δημιουργό" : "Αφαίρεση",
                      label: "Αφαίρεση",
                      style: { ...compactAStyle, height: 36, borderRadius: 12, padding: "0 12px" },
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}