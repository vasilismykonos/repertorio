// apps/web/app/lists/[id]/edit/ListEditMembersPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";

import { searchUsers } from "@/lib/users/searchUsers";
import type { UserPick } from "@/lib/users/types";

import { Crown, Eye, Music2, Plus, Shield, X } from "lucide-react";

/* =========================
   Types
========================= */

type Role = "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";

type MemberDto = {
  userId: number;
  role: Role;
  email: string | null;
  username: string | null;
  displayName: string | null;
};

type Props = {
  listId: number;
  viewerUserId: number;
  canManageMembers: boolean; // backend-provided (owner) OR any other legacy flag
  inputStyle: React.CSSProperties; // kept for compatibility
};

// ✅ AddRole EXCLUDES OWNER (δεν πρέπει να προστεθεί δεύτερος δημιουργός)
type AddRole = Exclude<Role, "OWNER">;
// ✅ Member role dropdown επίσης excludes OWNER
type EditableRole = Exclude<Role, "OWNER">;

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

type RoleTone = "gold" | "blue" | "violet" | "gray";

function roleMeta(role: Role): {
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: RoleTone;
} {
  switch (role) {
    case "OWNER":
      return {
        label: "Δημιουργός",
        hint: "Πλήρη δικαιώματα: λίστα, τραγούδια, μέλη",
        icon: <Crown size={16} />,
        tone: "gold",
      };
    case "LIST_EDITOR":
      return {
        label: "Διαχειριστής",
        hint: "Διαχείριση λίστας και μελών",
        icon: <Shield size={16} />,
        tone: "blue",
      };
    case "SONGS_EDITOR":
      return {
        label: "Συντάκτης",
        hint: "Επεξεργασία μόνο των τραγουδιών της λίστας",
        icon: <Music2 size={16} />,
        tone: "violet",
      };
    default:
      return {
        label: "Χρήστης",
        hint: "Μόνο προβολή (χωρίς επεξεργασία)",
        icon: <Eye size={16} />,
        tone: "gray",
      };
  }
}

function roleLabel(role: Role): string {
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
      background: "rgba(255, 255, 255, 0.08)",
    };
  }
  if (tone === "violet") {
    return {
      border: "1px solid rgba(190,140,255,0.28)",
      background: "rgba(190,140,255,0.08)",
    };
  }
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.05)",
  };
}

/* =========================
   UI bits
========================= */

function RoleChip({ role }: { role: Role }) {
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

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 950, fontSize: 16 }}>{title}</div>
      {desc ? <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>{desc}</div> : null}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.88, paddingLeft: 2 }}>{children}</div>;
}

function SegRolePicker({
  value,
  onChange,
  disabled,
}: {
  value: AddRole;
  onChange: (r: AddRole) => void;
  disabled: boolean;
}) {
  // ✅ NO OWNER HERE
  const opts: { value: AddRole; role: Role }[] = [
    { value: "VIEWER", role: "VIEWER" },
    { value: "SONGS_EDITOR", role: "SONGS_EDITOR" },
    { value: "LIST_EDITOR", role: "LIST_EDITOR" },
  ];

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <Label>Δικαιώματα</Label>

      <div
        role="radiogroup"
        aria-label="Δικαιώματα μέλους"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: 6,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.18)",
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
                background: active ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)",
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

  const opts: EditableRole[] = ["LIST_EDITOR", "SONGS_EDITOR", "VIEWER"];

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
      {/* trigger */}
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

          // “χρώμα ρόλου” στο trigger
          ...toneStyle(current.tone),

          // readable text
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

      {/* menu */}
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
                  alignItems: "center",
                  justifyContent: "flex-start",
                  columnGap: 10,
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  userSelect: "none",

                  // χρώμα ανά role
                  ...toneStyle(meta.tone),

                  // active emphasis
                  boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.28) inset" : "none",
                }}
              >
                <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95 }}>
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

export default function ListEditMembersPanel({ listId, viewerUserId, canManageMembers, inputStyle }: Props) {
  /* ---------- state ---------- */
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersErr, setMembersErr] = useState<string | null>(null);

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
      overflowX: "hidden",
    }),
    [],
  );

  const subCardStyle: React.CSSProperties = useMemo(
    () => ({
      marginTop: 12,
      padding: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.18)",
      overflowX: "hidden",
    }),
    [],
  );

  const compactAStyle: React.CSSProperties = useMemo(
    () => ({
      height: 40,
      padding: "0 14px",
      borderRadius: 14,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      whiteSpace: "nowrap",
    }),
    [],
  );

  const darkFieldStyle: React.CSSProperties = useMemo(
    () => ({
      ...inputStyle,
      width: "100%",
      height: 44,
      padding: "0 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(0,0,0,0.28)",
      color: "#ffffff",
      outline: "none",
      fontSize: 15,
      boxSizing: "border-box",
    }),
    [inputStyle],
  );

  /* ---------- derived ---------- */

  const memberRoleById = useMemo(() => {
    const m = new Map<number, Role>();
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

  const viewerRole: Role | null = useMemo(() => {
    return memberRoleById.get(Number(viewerUserId)) ?? null;
  }, [memberRoleById, viewerUserId]);

  // ✅ LIST_EDITOR μπορεί να διαχειριστεί μέλη. SONGS_EDITOR όχι.
  const canManageMembersEffective = !!canManageMembers || viewerRole === "OWNER" || viewerRole === "LIST_EDITOR";

  const membersBaseUrl = useMemo(() => {
    const uid = Number(viewerUserId);
    const qs = Number.isFinite(uid) && uid > 0 ? `?userId=${uid}` : "";
    return `/api/lists/${listId}/members${qs}`;
  }, [listId, viewerUserId]);

  function isAlreadyMemberById(userId: number | null | undefined): Role | null {
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
      !canManageMembersEffective ||
      membersLoading ||
      selectedIsAlreadyMember ||
      (!selectedUser && addMemberQuery.trim().length < 2)
    );
  }, [addMemberQuery, canManageMembersEffective, membersLoading, selectedIsAlreadyMember, selectedUser]);

  /* ---------- API actions ---------- */

  async function loadMembers() {
    setMembersErr(null);
    setMembersLoading(true);
    try {
      const res = await fetch(membersBaseUrl, { cache: "no-store" });
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
    if (!canManageMembersEffective) return;

    setMembersErr(null);
    setMembersLoading(true);
    try {
      const res = await fetch(membersBaseUrl, {
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

      // reset add form
      setAddMemberQuery("");
      setSelectedUser(null);
      setUserSug([]);
      setUserSugOpen(false);
      setAddMemberRole("VIEWER");
      setAddOpen(false);
    } catch (e: any) {
      setMembersErr(String(e?.message || e || "Failed"));
    } finally {
      setMembersLoading(false);
    }
  }

  async function deleteMember(memberUserId: number) {
    const n = Number(memberUserId);
    const isSelf = Number(viewerUserId) === n;

    // ✅ Everyone can remove themselves; otherwise only managers can remove others.
    if (!isSelf && !canManageMembersEffective) return;

    setMembersErr(null);
    setMembersLoading(true);
    try {
      const uid = Number(viewerUserId);
      const qs = Number.isFinite(uid) && uid > 0 ? `?userId=${uid}` : "";
      const res = await fetch(`/api/lists/${listId}/members/${memberUserId}${qs}`, {
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
    if (!canManageMembersEffective) return;

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
        setMembersErr("Το email είναι ήδη μέλος της λίστας.");
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

  function resetAddBox() {
    clearPickedUser();
    setAddMemberRole("VIEWER");
    setAddOpen(false);
  }

  /* ---------- effects ---------- */

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

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

  // search debounce
  useEffect(() => {
    if (!canManageMembersEffective) {
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
    }, 220);

    return () => {
      if (userSugDebounceRef.current) {
        window.clearTimeout(userSugDebounceRef.current);
        userSugDebounceRef.current = null;
      }
    };
  }, [addMemberQuery, addOpen, canManageMembersEffective, selectedUser]);

  /* ---------- render ---------- */

  return (
    <>
      <style jsx global>{`
        .lem-row {
          display: grid;
          grid-template-columns: 1fr auto auto; /* ✅ width only as needed */
          gap: 12px;
          align-items: center;
          min-width: 0;
        }
        @media (max-width: 820px) {
          .lem-row {
            grid-template-columns: 1fr;
            align-items: stretch;
          }
          .lem-actions {
            justify-content: flex-end !important;
          }
        }

        .lem-add-grid {
          display: grid;
          grid-template-columns: 1fr 320px auto;
          gap: 12px;
          align-items: end;
          min-width: 0;
        }
        @media (max-width: 900px) {
          .lem-add-grid {
            grid-template-columns: 1fr;
            align-items: stretch;
          }
          .lem-add-actions {
            justify-content: flex-end !important;
          }
        }

        .lem-sug {
          color: #fff !important;
        }
        .lem-sug * {
          color: #fff !important;
        }
        .lem-sug svg {
          stroke: #fff !important;
        }
      `}</style>

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <SectionTitle title="Κοινή χρήση" />
        </div>

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

        {/* Add member */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {!canManageMembersEffective ? (
                <div style={{ fontSize: 12, opacity: 0.75, whiteSpace: "nowrap" }}>
                  (μόνο Δημιουργός/Διαχειριστής)
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                if (!canManageMembersEffective) return;
                setAddOpen((v) => !v);
                setUserSugOpen(false);
              }}
              disabled={!canManageMembersEffective || membersLoading}
              title={addOpen ? "Κλείσιμο" : "Προσθήκη"}
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
                cursor: !canManageMembersEffective || membersLoading ? "not-allowed" : "pointer",
                opacity: !canManageMembersEffective || membersLoading ? 0.6 : 1,
              }}
              aria-expanded={addOpen}
            >
              {addOpen ? <X size={18} /> : <Plus size={18} />}
            </button>
          </div>

          {addOpen ? (
            <div ref={addBoxRef} style={subCardStyle}>
              <div className="lem-add-grid">
                <div style={{ position: "relative", display: "grid", gap: 6, minWidth: 0 }}>
                  <Label>Χρήστης</Label>

                  <input
                    value={addMemberQuery}
                    onChange={(e) => {
                      setAddMemberQuery(e.target.value);
                      setSelectedUser(null);
                      setUserSugOpen(true);
                    }}
                    onFocus={() => {
                      if (canManageMembersEffective) setUserSugOpen(true);
                    }}
                    placeholder="Αναζήτηση (όνομα, username, email) ή βάλε email…"
                    disabled={!canManageMembersEffective || membersLoading}
                    style={darkFieldStyle}
                  />

                  {selectedUser ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        Επιλεγμένος:{" "}
                        <strong style={{ opacity: 1 }}>
                          {selectedUser.displayName || selectedUser.username || "Χρήστης"}
                        </strong>
                      </div>

                      <button
                        type="button"
                        onClick={clearPickedUser}
                        disabled={!canManageMembersEffective || membersLoading}
                        title="Καθαρισμός"
                        style={{
                          height: 30,
                          padding: "0 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(0,0,0,0.16)",
                          color: "#fff",
                          cursor: !canManageMembersEffective || membersLoading ? "not-allowed" : "pointer",
                          opacity: !canManageMembersEffective || membersLoading ? 0.6 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        <X size={14} />
                        Καθαρισμός
                      </button>
                    </div>
                  ) : null}

                  {canManageMembersEffective && userSugOpen ? (
                    <div
                      className="lem-sug"
                      style={{
                        position: "absolute",
                        top: selectedUser ? 106 : 74,
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(20,20,20,0.98)",
                        boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid rgba(255,255,255,0.10)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 800 }}>
                          {userSugLoading ? "Αναζήτηση…" : userSugErr ? `Σφάλμα: ${userSugErr}` : "Επίλεξε χρήστη"}
                        </div>

                        <button
                          type="button"
                          onClick={() => setUserSugOpen(false)}
                          title="Κλείσιμο"
                          style={{
                            width: 34,
                            height: 30,
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.06)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <X size={14} />
                        </button>
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
                                borderBottom: idx === userSug.length - 1 ? "none" : "1px solid rgba(255,255,255,0.08)",
                                background: "transparent",
                                cursor: disabledPick ? "not-allowed" : "pointer",
                                borderRadius: 0,
                                opacity: disabledPick ? 0.55 : 1,
                              }}
                              title={existingRole ? `${label} (Ήδη μέλος: ${roleLabel(existingRole)})` : label}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  minWidth: 0,
                                }}
                              >
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
                                {existingRole ? <RoleChip role={existingRole} /> : null}
                              </div>

                              <div style={{ fontSize: 12, opacity: 0.75 }}>
                                {u.username ? `@${u.username}` : ""}
                                {!u.username ? "—" : ""}
                                {existingRole ? " • Ήδη μέλος" : ""}
                              </div>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <SegRolePicker value={addMemberRole} onChange={setAddMemberRole} disabled={membersLoading} />

                <div className="lem-add-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  {A.cancel({
                    onClick: resetAddBox,
                    disabled: membersLoading,
                    title: "Άκυρο",
                    label: "Άκυρο",
                    style: compactAStyle,
                  })}

                  {A.add({
                    onClick: onAddMember,
                    disabled: disabledAdd,
                    title: selectedIsAlreadyMember ? "Ο χρήστης είναι ήδη μέλος" : "Προσθήκη",
                    label: "Προσθήκη",
                    style: compactAStyle,
                  })}
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
                Tip: Μπορείς να βάλεις <strong>email</strong> απευθείας (αν δεν βρίσκει χρήστη), ή να διαλέξεις από τη
                λίστα αποτελεσμάτων.
              </div>
            </div>
          ) : null}
        </div>

        {/* Members list */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.92 }}>Μέλη ({members.length})</div>
          </div>

          {membersLoading ? <div style={{ marginTop: 10, opacity: 0.8 }}>Φόρτωση…</div> : null}

          {members.length === 0 && !membersLoading ? (
            <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>Δεν υπάρχουν μέλη.</div>
          ) : null}

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {members.map((m) => {
              const isOwner = m.role === "OWNER";
              const rowIsMe = Number(m.userId) === Number(viewerUserId);

              const canManageOthers = canManageMembersEffective && !rowIsMe;
              const canChangeRole = canManageMembersEffective && !rowIsMe && !isOwner;
              const canRemove = (rowIsMe && !membersLoading) || (canManageOthers && !isOwner && !membersLoading);

              const removeLabel = rowIsMe ? "Αποχώρηση" : "Αφαίρεση";
              const removeTitle = rowIsMe
                ? "Αποχώρηση από τη λίστα"
                : isOwner
                  ? "Δεν μπορείς να αφαιρέσεις τον Δημιουργό"
                  : "Αφαίρεση";

              const roleIcon = roleMeta(m.role).icon;

              return (
                <div
                  key={m.userId}
                  className="lem-row"
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    background: "rgba(0,0,0,0.18)",
                    minWidth: 0,
                  }}
                >
                  {/* identity */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.06)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flex: "0 0 auto",
                        }}
                        title={roleLabel(m.role)}
                        aria-label={roleLabel(m.role)}
                      >
                        {roleIcon}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            minWidth: 0,
                            maxWidth: "100%",
                          }}
                        >
                          {memberDisplay(m)} {rowIsMe ? <span style={{ opacity: 0.7 }}>(εσύ)</span> : null}
                        </div>

                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{memberSubline(m)}</div>
                      </div>
                    </div>
                  </div>

                  {/* role editor */}
                  {isOwner ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
                      <div title={roleMeta("OWNER").hint}>
                        <RoleChip role="OWNER" />
                      </div>
                    </div>
                  ) : (
                    <RoleDropdown
                      value={m.role as EditableRole}
                      disabled={!canChangeRole || membersLoading}
                      onChange={(r) => upsertMember({ memberUserId: m.userId, role: r })}
                    />
                  )}

                  {/* actions */}
                  <div className="lem-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
                    {A.del({
                      onClick: () => deleteMember(m.userId),
                      disabled: !canRemove,
                      title: removeTitle,
                      label: removeLabel,
                      style: {
                        height: 36,
                        borderRadius: 12,
                        padding: "0 12px",
                        display: "inline-flex",
                        alignItems: "center",
                      },
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