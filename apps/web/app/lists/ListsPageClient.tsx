// apps/web/app/lists/ListsPageClient.tsx
"use client";

import React, { useMemo, useRef } from "react";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import type { ListsIndexResponse } from "./page";

import { Crown, Eye, Music2, Shield, Users } from "lucide-react";

import ListsGroupsBlock, { type ListGroupWithRole } from "./ListsGroupsBlock";

/* =========================
   Types
========================= */

type Role = "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER" | "ADMIN";

type Props = {
  initialSearch: string;
  initialGroupId: string;
  page: number;
  pageSize: number;

  data: ListsIndexResponse;
  facets: ListsIndexResponse;

  groupsIndex?: { items: ListGroupWithRole[] } | null;
  viewerIsAdmin?: boolean;
};

/* =========================
   Helpers
========================= */

function roleLabel(role: Role | undefined | null): string {
  if (!role) return "";
  switch (role) {
    case "ADMIN":
      return "ADMIN";
    case "OWNER":
      return "";
    case "LIST_EDITOR":
      return "";
    case "SONGS_EDITOR":
      return "";
    case "VIEWER":
      return "";
    default:
      return String(role);
  }
}

function roleHint(role: Role | undefined | null): string {
  if (!role) return "";
  switch (role) {
    case "ADMIN":
      return "Προβολή ως διαχειριστής";
    case "OWNER":
      return "Ορίζει δικαιώματα και διαχειρίζεται τη λίστα.";
    case "LIST_EDITOR":
      return "Μπορεί να αλλάζει ρυθμίσεις/τίτλο και να διαχειρίζεται μέλη.";
    case "SONGS_EDITOR":
      return "Μπορεί να επεξεργάζεται μόνο τα τραγούδια της λίστας.";
    case "VIEWER":
      return "Μπορεί να βλέπει τη λίστα.";
    default:
      return String(role);
  }
}

function roleIcon(role: Role): React.ReactNode {
  switch (role) {
    case "OWNER":
      return <Crown size={14} />;
    case "LIST_EDITOR":
      return <Shield size={14} />;
    case "SONGS_EDITOR":
      return <Music2 size={14} />;
    case "VIEWER":
      return <Eye size={14} />;
    case "ADMIN":
      return <Shield size={14} />;
    default:
      return null;
  }
}

type RoleTone = "gold" | "blue" | "violet" | "gray" | "admin";

function roleTone(role: Role): RoleTone {
  if (role === "ADMIN") return "admin";
  if (role === "OWNER") return "gold";
  if (role === "LIST_EDITOR") return "blue";
  if (role === "SONGS_EDITOR") return "violet";
  return "gray";
}

function roleBadgeStyle(role: Role): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(0,0,0,0.28)",
    color: "rgba(255,255,255,0.92)",
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
    lineHeight: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  const tone = roleTone(role);

  if (tone === "admin") {
    return { ...base, border: "1px solid rgba(255,255,255,0.70)", background: "rgba(255,255,255,0.12)" };
  }
  if (tone === "gold") {
    return { ...base, border: "1px solid rgba(255,215,120,0.45)", background: "rgba(255,215,120,0.12)" };
  }
  if (tone === "blue") {
    return { ...base, border: "1px solid rgba(120,185,255,0.40)", background: "rgba(120,185,255,0.10)" };
  }
  if (tone === "violet") {
    return { ...base, border: "1px solid rgba(190,140,255,0.40)", background: "rgba(190,140,255,0.10)" };
  }
  return { ...base, border: "1px solid rgba(255,255,255,0.26)", background: "rgba(255,255,255,0.06)" };
}

// Εμφανίζουμε ΜΟΝΟ αυτά τα roles ως pills (και όχι OWNER).
const ROLE_ORDER: Role[] = ["LIST_EDITOR", "SONGS_EDITOR", "VIEWER"];

function normalizeRoleCounts(list: any): Record<Role, number> {
  const raw: any =
    list?.memberRoleCounts ??
    list?.memberCountsByRole ??
    list?.membersByRole ??
    list?.roleCounts ??
    null;

  const out: Record<Role, number> = {
    OWNER: 0,
    LIST_EDITOR: 0,
    SONGS_EDITOR: 0,
    VIEWER: 0,
    ADMIN: 0,
  };

  const mapKey = (k: string): Role | null => {
    const key = String(k || "").trim().toUpperCase();
    if (key === "OWNER") return "OWNER";
    if (key === "LIST_EDITOR") return "LIST_EDITOR";
    if (key === "SONGS_EDITOR") return "SONGS_EDITOR";
    if (key === "VIEWER") return "VIEWER";
    if (key === "ADMIN") return "ADMIN";

    if (key === "EDITOR") return "LIST_EDITOR";
    if (key === "LIST_VIEWER") return "VIEWER";
    if (key === "SONGS_VIEWER") return "VIEWER";
    return null;
  };

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const role = mapKey(k);
      if (!role) continue;

      if (Array.isArray(v)) {
        out[role] = v.length;
        continue;
      }

      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[role] = Math.floor(n);
    }
    return out;
  }

  if (Array.isArray(raw)) {
    for (const row of raw) {
      const role = mapKey(row?.role);
      if (!role) continue;

      if (Array.isArray(row?.users)) {
        out[role] = row.users.length;
        continue;
      }

      const n = Number(row?.count ?? row?._count ?? row?.value);
      if (Number.isFinite(n) && n >= 0) out[role] = Math.floor(n);
    }
    return out;
  }

  if (!raw && Array.isArray(list?.members)) {
    for (const m of list.members) {
      const role = mapKey(m?.role);
      if (role) out[role] = (out[role] || 0) + 1;
    }
  }

  return out;
}

function visibleRoleEntries(counts: Record<Role, number>): Array<{ role: Role; count: number }> {
  const entries: Array<{ role: Role; count: number }> = [];
  for (const role of ROLE_ORDER) {
    const c = Number(counts?.[role] ?? 0);
    if (Number.isFinite(c) && c > 0) entries.push({ role, count: Math.floor(c) });
  }
  return entries;
}

function RoleCountPills({ counts, titlePrefix }: { counts: Record<Role, number>; titlePrefix?: string }) {
  const entries = useMemo(() => visibleRoleEntries(counts), [counts]);
  if (entries.length === 0) return null;

  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {entries.map(({ role, count }) => (
        <span
          key={role}
          style={roleBadgeStyle(role)}
          title={`${titlePrefix ? `${titlePrefix} • ` : ""}${roleLabel(role)}: ${count} — ${roleHint(role)}`}
        >
          <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95 }}>
            {roleIcon(role)}
          </span>
          <span style={{ opacity: 0.95 }}>{count}</span>
        </span>
      ))}
    </div>
  );
}

/* =========================
   Page
========================= */

export default function ListsPageClient({
  initialSearch,
  initialGroupId,
  page,
  pageSize,
  data,
  facets,
  groupsIndex,
  viewerIsAdmin,
}: Props) {
  const search = (initialSearch ?? "").trim();
  const groupId = initialGroupId ?? "";

  const { items } = data;
  const facetTotal = facets.total ?? 0;

  function buildPageUrl(params: { search?: string; groupId?: string; page?: number }) {
    const sp = new URLSearchParams();
    if (params.search && params.search.trim()) sp.set("search", params.search.trim());
    if (params.groupId !== undefined && params.groupId !== "") sp.set("groupId", params.groupId);
    if (params.page && params.page > 1) sp.set("page", String(params.page));
    const qs = sp.toString();
    return qs ? `/lists?${qs}` : "/lists";
  }

  const hasPrev = page > 1;
  const hasNext = page * pageSize < (data.total ?? 0);

  const formRef = useRef<HTMLFormElement | null>(null);

  const titleFontSize = 18;
  const titleLineHeight = "22px";
  const metaFontSize = 13;
  const countBaseSize = 20;

  return (
    <section style={{ padding: "1rem" }}>
      <ActionBar
        title="Λίστες"
        left={A.backLink({ href: "/", label: "Πίσω" })}
        right={
          <>
            {viewerIsAdmin ? (
              <span style={roleBadgeStyle("ADMIN")} title={roleHint("ADMIN")}>
                <span aria-hidden="true" style={{ display: "inline-flex" }}>
                  {roleIcon("ADMIN")}
                </span>
                ADMIN
              </span>
            ) : null}

            {A.link({
              href: "/lists/new",
              label: "Νέα λίστα",
              action: "new",
              variant: "primary",
            })}
          </>
        }
      />

      {/* Search */}
      <form
        ref={formRef}
        action="/lists"
        method="get"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Αναζήτηση λίστας..."
            style={{
              flex: "1 1 220px",
              maxWidth: "400px",
              minWidth: "180px",
              padding: "8px 12px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.30)",
              background: "#ffffff",
              color: "#000000",
              fontSize: 16,
              outline: "none",
            }}
          />

          {groupId && <input type="hidden" name="groupId" value={groupId} />}

          {A.search({
            label: "Αναζήτηση",
            onClick: () => formRef.current?.requestSubmit(),
          })}
        </div>
      </form>

      {/* ✅ Groups block extracted */}
      <ListsGroupsBlock
        search={search}
        groupId={groupId}
        facetTotal={facetTotal}
        groupsIndex={groupsIndex}
        facetsGroups={(facets as any)?.groups ?? []}
        viewerIsAdmin={viewerIsAdmin}
        groupsEditHref="/lists/groups"
      />

      {/* Lists */}
      {items.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16 }}>Δεν βρέθηκαν λίστες.</p>
      ) : (
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {items.map((list: any) => {
            const title = list.title || `Λίστα #${list.id}`;
            const isMarked = Boolean(list.marked);

            const itemsCount = Number.isFinite(list.itemsCount) ? Number(list.itemsCount) : 0;
            const countText = String(itemsCount);
            const countFontSize = countText.length >= 4 ? 16 : countText.length === 3 ? 18 : countBaseSize;

            const role: Role | undefined = list.role;

            const roleCounts = normalizeRoleCounts(list);

            const totalMembersExcludingOwner =
              (roleCounts.LIST_EDITOR || 0) + (roleCounts.SONGS_EDITOR || 0) + (roleCounts.VIEWER || 0);

            const hasAnyNonOwnerMember = totalMembersExcludingOwner > 0;

            return (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                style={{
                  textDecoration: "none",
                  color: "#fff",
                  borderRadius: 20,
                  border: isMarked ? "1px solid rgba(255,255,255,0.95)" : "1px solid rgba(255,255,255,0.28)",
                  background: isMarked ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  minHeight: 144,
                  boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
                  outline: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                      fontSize: countFontSize,
                      border: "1px solid rgba(255,255,255,0.34)",
                      background: "rgba(0,0,0,0.30)",
                      flex: "0 0 auto",
                      color: "#fff",
                      textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                    }}
                    aria-label={`${itemsCount} τραγούδια`}
                    title={`${itemsCount} τραγούδια`}
                  >
                    {countText}
                  </div>

                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {isMarked ? (
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.40)",
                          background: "rgba(255,255,255,0.12)",
                          color: "#fff",
                          whiteSpace: "nowrap",
                        }}
                        aria-label="Αγαπημένη"
                        title="Αγαπημένη"
                      >
                        ⭐
                      </span>
                    ) : null}

                    {role ? (
                      <span style={roleBadgeStyle(role)} title={`Δικαίωμα λίστας: ${roleLabel(role)} — ${roleHint(role)}`}>
                        <span aria-hidden="true" style={{ display: "inline-flex" }}>
                          {roleIcon(role)}
                        </span>
                        {roleLabel(role)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: titleFontSize,
                    fontWeight: isMarked ? 900 : 800,
                    lineHeight: titleLineHeight,
                    letterSpacing: 0.2,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    wordBreak: "break-word",
                    color: "rgba(255,255,255,0.96)",
                    textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                  }}
                >
                  {title}
                </div>

                <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  {hasAnyNonOwnerMember ? (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: metaFontSize,
                        color: "rgba(255,255,255,0.78)",
                        whiteSpace: "nowrap",
                      }}
                      title="Σύνολο μελών (εκτός δημιουργού)"
                    >
                      <Users size={14} style={{ opacity: 0.9 }} />
                      {totalMembersExcludingOwner} μέλη
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: metaFontSize,
                        color: "rgba(255,255,255,0.55)",
                        whiteSpace: "nowrap",
                      }}
                      title="Δεν υπάρχουν άλλα μέλη (εκτός δημιουργού)"
                    />
                  )}

                  <RoleCountPills counts={roleCounts} titlePrefix="Μέλη ανά ρόλο" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(data.total ?? 0) > pageSize && (
        <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.98rem", color: "rgba(255,255,255,0.90)" }}>
          <div>
            Σελίδα {page} από {Math.max(1, Math.ceil((data.total ?? 0) / pageSize))} ({data.total ?? 0} λίστες)
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            {hasPrev ? (
              <Link href={buildPageUrl({ search, groupId, page: page - 1 })} style={{ color: "#fff", textDecoration: "none", fontWeight: 700 }}>
                ← Προηγούμενη
              </Link>
            ) : (
              <span style={{ color: "rgba(255,255,255,0.45)" }}>← Προηγούμενη</span>
            )}

            {hasNext ? (
              <Link href={buildPageUrl({ search, groupId, page: page + 1 })} style={{ color: "#fff", textDecoration: "none", fontWeight: 700 }}>
                Επόμενη →
              </Link>
            ) : (
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Επόμενη →</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}