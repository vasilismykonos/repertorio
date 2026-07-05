"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { A } from "@/app/components/buttons";
import { Crown, Eye, MoreHorizontal, Shield, Music2 } from "lucide-react";

type Role = "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER" | "ADMIN";

export type ListGroupWithRole = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
  role: Role;
};

const RECENT_GROUPS_KEY = "repertorio:recentGroupIds";
const MAX_COLLAPSED_GROUPS = 5;

function groupIdValue(value: any): number | null {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function readRecentGroupIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_GROUPS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(groupIdValue).filter((id): id is number => Boolean(id)).slice(0, 20);
  } catch {
    return [];
  }
}

function rememberRecentGroup(id: any): number[] {
  const groupId = groupIdValue(id);
  if (!groupId || typeof window === "undefined") return readRecentGroupIds();
  const next = [groupId, ...readRecentGroupIds().filter((item) => item !== groupId)].slice(0, 20);
  try {
    window.localStorage.setItem(RECENT_GROUPS_KEY, JSON.stringify(next));
  } catch {
    // Best-effort preference only.
  }
  return next;
}

function stripTrailingCount(label: string): string {
  if (!label) return "";
  return String(label).replace(/\s*\(\d+\)\s*$/, "").trim();
}

function roleLabel(role: Role | undefined | null): string {
  if (!role) return "";
  switch (role) {
    case "ADMIN":
      return "ADMIN";
    case "OWNER":
      return "Δημιουργός";
    case "LIST_EDITOR":
      return "Διαχειριστής";
    case "SONGS_EDITOR":
      return "Τραγούδια";
    case "VIEWER":
      return "Χρήστης";
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
      return "Ορίζει δικαιώματα και διαχειρίζεται το tag.";
    case "LIST_EDITOR":
      return "Μπορεί να διαχειρίζεται μέλη του tag.";
    case "SONGS_EDITOR":
      return "Μπορεί να επεξεργάζεται μόνο λίστες/τραγούδια (ανάλογα με τον κανόνα σου).";
    case "VIEWER":
      return "Μπορεί να βλέπει το tag.";
    default:
      return String(role);
  }
}

function roleIcon(role: Role): React.ReactNode {
  switch (role) {
    case "OWNER":
      return <Crown size={16} />;
    case "LIST_EDITOR":
      return <Shield size={16} />;
    case "SONGS_EDITOR":
      return <Music2 size={16} />;
    case "VIEWER":
      return <Eye size={16} />;
    case "ADMIN":
      return <Shield size={16} />;
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

type Props = {
  search: string;
  groupId: string;
  facetTotal: number;

  groupsIndex?: { items: ListGroupWithRole[] } | null;
  facetsGroups?: Array<{ id: number; title: string; fullTitle?: string | null; listsCount?: number }> | null;

  viewerIsAdmin?: boolean;
  groupsEditHref?: string;
};

export default function ListsGroupsBlock({
  search,
  groupId,
  facetTotal,
  groupsIndex,
  facetsGroups,
  viewerIsAdmin,
  groupsEditHref = "/lists/groups",
}: Props) {
  const [recentGroupIds, setRecentGroupIds] = useState<number[]>([]);
  const [showAllGroups, setShowAllGroups] = useState(false);

  function buildPageUrl(params: { search?: string; groupId?: string; page?: number }) {
    const sp = new URLSearchParams();
    if (params.search && params.search.trim()) sp.set("search", params.search.trim());
    if (params.groupId !== undefined && params.groupId !== "") sp.set("groupId", params.groupId);
    if (params.page && params.page > 1) sp.set("page", String(params.page));
    const qs = sp.toString();
    return qs ? `/lists?${qs}` : "/lists";
  }

  useEffect(() => {
    setRecentGroupIds(readRecentGroupIds());
  }, []);

  useEffect(() => {
    const selectedGroupId = groupIdValue(groupId);
    if (!selectedGroupId) return;
    setRecentGroupIds(rememberRecentGroup(selectedGroupId));
  }, [groupId]);

  const groupsForPills: Array<{
    id: number;
    title: string;
    fullTitle: string | null;
    listsCount: number;
    role?: Role;
  }> = useMemo(() => {
    const gi = groupsIndex?.items ?? [];
    if (gi.length > 0) {
      return gi
        .slice()
        .sort((a, b) => {
          const at = (a.fullTitle || a.title || "").toLowerCase();
          const bt = (b.fullTitle || b.title || "").toLowerCase();
          if (at < bt) return -1;
          if (at > bt) return 1;
          return a.id - b.id;
        });
    }

    return (facetsGroups ?? []).map((g) => ({
      id: g.id,
      title: g.title,
      fullTitle: g.fullTitle ?? null,
      listsCount: g.listsCount ?? 0,
    }));
  }, [groupsIndex, facetsGroups]);

  const groupsByRecent = useMemo(() => {
    const recentRank = new Map(recentGroupIds.map((id, index) => [id, index]));
    return groupsForPills
      .map((group, index) => ({ group, index }))
      .sort((a, b) => {
        const ar = recentRank.has(a.group.id) ? recentRank.get(a.group.id)! : Number.POSITIVE_INFINITY;
        const br = recentRank.has(b.group.id) ? recentRank.get(b.group.id)! : Number.POSITIVE_INFINITY;
        if (ar !== br) return ar - br;
        return a.index - b.index;
      })
      .map(({ group }) => group);
  }, [groupsForPills, recentGroupIds]);

  const visibleGroups = showAllGroups ? groupsByRecent : groupsByRecent.slice(0, MAX_COLLAPSED_GROUPS);
  const hiddenGroupsCount = Math.max(groupsByRecent.length - MAX_COLLAPSED_GROUPS, 0);

  const roleByGroupId = useMemo(() => {
    const map = new Map<number, Role>();
    for (const g of groupsIndex?.items ?? []) {
      if (g?.id && g.role) map.set(g.id, g.role);
    }
    return map;
  }, [groupsIndex]);

  const totalFromGroups = groupsForPills.reduce(
    (acc, g) => acc + (Number.isFinite(g.listsCount) ? g.listsCount : 0),
    0,
  );
  const noGroupCount = Math.max(facetTotal - totalFromGroups, 0);

  const groupPillFontSize = 18;
  function pillStyle(isActive: boolean): React.CSSProperties {
    return {
      padding: "6px 12px",
      borderRadius: 16,
      background: isActive ? "#0070f3" : "#222",
      color: "#fff",
      border: isActive ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.7)",
      textDecoration: "none",
      fontWeight: 800,
      fontSize: groupPillFontSize,
      lineHeight: "22px",
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      flex: "0 1 auto",
      maxWidth: "100%",
      minWidth: 0,
      overflow: "hidden",
    };
  }

  // (προαιρετικό) δείχνει "ADMIN" chip στο header αν είναι admin
  const adminChip = viewerIsAdmin ? (
    <span style={roleBadgeStyle("ADMIN")} title={roleHint("ADMIN")}>
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        {roleIcon("ADMIN")}
      </span>
      ADMIN
    </span>
  ) : null;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.22)",
        background: "rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: 12,
        marginBottom: "1rem",
        boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ fontWeight: 900, color: "#fff", fontSize: 14, letterSpacing: 0.3 }}>Tags</div>
          {adminChip}
        </div>

        {/* Πάει στη σελίδα που φτιάχνεις/προσθέτεις tags. */}
        {A.link({
          href: groupsEditHref,
          label: "Επεξεργασία",
          action: "edit",
          variant: "secondary",
          title: "Διαχείριση / Προσθήκη νέων tags",
        })}
      </div>

      <div className="active-filters" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", width: "100%", minWidth: 0, overflow: "hidden" }}>
        <Link href={buildPageUrl({ search, groupId: "", page: 1 })} style={pillStyle(!groupId)}>
          <span>Όλες</span>
          <span style={{ opacity: 0.9 }}>({facetTotal})</span>
        </Link>

        <Link href={buildPageUrl({ search, groupId: "null", page: 1 })} style={pillStyle(groupId === "null")}>
          <span>Χωρίς tag</span>
          <span style={{ opacity: 0.9 }}>({noGroupCount})</span>
        </Link>

        {visibleGroups.map((g) => {
          const isActive = groupId !== "" && groupId !== "null" && groupId === String(g.id);

          const rawLabel = g.fullTitle || g.title || `Tag #${g.id}`;
          const cleanLabel = stripTrailingCount(rawLabel);

          const role = (g as any).role ?? roleByGroupId.get(g.id);

          return (
            <Link
              key={g.id}
              href={buildPageUrl({ search, groupId: String(g.id), page: 1 })}
              onClick={() => setRecentGroupIds(rememberRecentGroup(g.id))}
              style={pillStyle(isActive)}
              title={role ? `Δικαίωμα tag: ${roleLabel(role)} — ${roleHint(role)}` : undefined}
            >
              {/* Εδώ φαίνεται πάντα το icon δίπλα από το tag. */}
              {role ? (
                <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95, flex: "0 0 auto" }}>
                  {roleIcon(role)}
                </span>
              ) : null}

              <span
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  minWidth: 0,
                  overflow: "hidden",
                  flex: "1 1 auto",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {cleanLabel}
                </span>
                <span style={{ opacity: 0.9, flex: "0 0 auto" }}>({g.listsCount ?? 0})</span>
              </span>

              {/* ✅ κρατάμε και badge label (όπως πριν) */}
              {role ? (
                <span style={roleBadgeStyle(role)} title={`Δικαίωμα tag: ${roleLabel(role)} — ${roleHint(role)}`}>
                  {roleLabel(role)}
                </span>
              ) : null}
            </Link>
          );
        })}

        {hiddenGroupsCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAllGroups((value) => !value)}
            style={{
              ...pillStyle(false),
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            title={showAllGroups ? "Εμφάνιση λιγότερων tags" : `Εμφάνιση ${hiddenGroupsCount} ακόμα tags`}
            aria-label={showAllGroups ? "Εμφάνιση λιγότερων tags" : `Εμφάνιση ${hiddenGroupsCount} ακόμα tags`}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
            <span style={{ opacity: 0.9 }}>{showAllGroups ? "Λιγότερες" : `+${hiddenGroupsCount}`}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
