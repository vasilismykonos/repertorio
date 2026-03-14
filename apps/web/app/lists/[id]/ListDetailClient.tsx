// apps/web/app/lists/[id]/ListDetailClient.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import type { ListDetailDto } from "./page";

import { Crown, Eye, Music2, Shield } from "lucide-react";

type Role = ListDetailDto["role"];

type Props = {
  listId: number;
  viewerUserId: number;
  data: ListDetailDto;
};

function roleLabel(role: Role) {
  if (role === "OWNER") return "Δημιουργός";
  if (role === "LIST_EDITOR") return "Διαχειριστής";
  if (role === "SONGS_EDITOR") return "Συντάκτης";
  return "Χρήστης";
}

function roleHint(role: Role) {
  if (role === "OWNER") return "Ορίζει δικαιώματα και διαχειρίζεται τη λίστα.";
  if (role === "LIST_EDITOR") return "Μπορεί να αλλάζει ρυθμίσεις/τίτλο και να διαχειρίζεται μέλη.";
  if (role === "SONGS_EDITOR") return "Μπορεί να επεξεργάζεται μόνο τα τραγούδια της λίστας.";
  return "Μπορεί να βλέπει τη λίστα.";
}

function roleIcon(role: Role): React.ReactNode {
  if (role === "OWNER") return <Crown size={14} />;
  if (role === "LIST_EDITOR") return <Shield size={14} />;
  if (role === "SONGS_EDITOR") return <Music2 size={14} />;
  return <Eye size={14} />;
}

type RoleTone = "gold" | "blue" | "violet" | "gray";

function roleTone(role: Role): RoleTone {
  if (role === "OWNER") return "gold";
  if (role === "LIST_EDITOR") return "blue";
  if (role === "SONGS_EDITOR") return "violet";
  return "gray";
}

function roleBadgeStyle(role: Role): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
    lineHeight: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  };

  const tone = roleTone(role);

  if (tone === "gold") {
    return {
      ...base,
      border: "1px solid rgba(255,215,120,0.45)",
      background: "rgba(255,215,120,0.12)",
    };
  }

  if (tone === "blue") {
    return {
      ...base,
      border: "1px solid rgba(120,185,255,0.40)",
      background: "rgba(120,185,255,0.10)",
    };
  }

  if (tone === "violet") {
    return {
      ...base,
      border: "1px solid rgba(190,140,255,0.40)",
      background: "rgba(190,140,255,0.10)",
    };
  }

  return {
    ...base,
    border: "1px solid rgba(255,255,255,0.26)",
    background: "rgba(255,255,255,0.06)",
  };
}

export default function ListDetailClient({ listId, viewerUserId, data }: Props) {
  void viewerUserId;

  const { title, groupTitle, marked, role, items } = data;

  const canEdit = role === "OWNER" || role === "LIST_EDITOR" || role === "SONGS_EDITOR";

  const songIdByListItemId = useMemo(() => {
    const map = new Map<number, { songId: number; pos: number }>();
    let pos = 0;

    for (const it of items ?? []) {
      const sid = Number((it as any).songId);
      if (Number.isFinite(sid) && sid > 0) {
        map.set(Number((it as any).listItemId), { songId: sid, pos });
        pos += 1;
      }
    }

    return map;
  }, [items]);

  const headerTitle = title || `Λίστα #${listId}`;
  const listSongsHref = `/songs?skip=0&take=50&listIds=${encodeURIComponent(String(listId))}`;

  const headerTitleFontSize = 22;
  const metaFontSize = 14;
  const itemFontSize = 18;
  const itemLineHeight = "24px";

  return (
    <section style={{ padding: "1rem" }}>
      <ActionBar
        left={
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {A.backLink({ href: "/lists", label: "Πίσω" })}

            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {marked ? (
                <span
                  aria-label="Αγαπημένη λίστα"
                  title="Αγαπημένη λίστα"
                  style={{
                    color: "#f5a623",
                    fontSize: 20,
                    lineHeight: 1,
                    textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                    flex: "0 0 auto",
                  }}
                >
                  ★
                </span>
              ) : null}

              <span
                style={{
                  fontWeight: 900,
                  fontSize: 16,
                  letterSpacing: 0.2,
                  color: "rgba(255,255,255,0.96)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={headerTitle}
              >
                {headerTitle}
              </span>
            </div>
          </div>
        }
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {A.link({
              href: listSongsHref,
              label: "Φίλτρα",
              action: "search",
              variant: "secondary",
            })}

            {canEdit
              ? A.link({
                  href: `/lists/${listId}/edit`,
                  label: "Επεξεργασία",
                  action: "edit",
                  variant: "secondary",
                })
              : null}
          </div>
        }
      />

      <header style={{ margin: "0.85rem 0 1rem" }}>
        <h1
          style={{
            margin: 0,
            fontSize: headerTitleFontSize,
            fontWeight: 900,
            letterSpacing: 0.2,
            color: "rgba(255,255,255,0.98)",
            textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            lineHeight: "28px",
            wordBreak: "break-word",
          }}
        >
          {headerTitle}
        </h1>

        <div
          style={{
            fontSize: metaFontSize,
            color: "rgba(255,255,255,0.80)",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.85rem",
            marginTop: 10,
            alignItems: "center",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Ρόλος:
            <span style={roleBadgeStyle(role)} title={roleHint(role)}>
              <span aria-hidden="true" style={{ display: "inline-flex", opacity: 0.95 }}>
                {roleIcon(role)}
              </span>
              {roleLabel(role)}
            </span>
          </span>

          <span>
            Ομάδα:{" "}
            <strong style={{ color: "#fff", fontWeight: 800 }}>
              {groupTitle ? groupTitle : "Χωρίς ομάδα"}
            </strong>
          </span>
        </div>
      </header>

      {!items || items.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16 }}>
          Η λίστα δεν περιέχει τραγούδια.
        </p>
      ) : (
        <ul style={{ listStyleType: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {items.map((item: any) => {
            const listItemId = Number(item.listItemId);
            const sortId = item.sortId ?? "";
            const titleText = item.title || `(αντικείμενο #${listItemId})`;

            const info = songIdByListItemId.get(listItemId);
            const songHref = info?.songId
              ? `/songs/${info.songId}?listId=${encodeURIComponent(String(listId))}&listPos=${encodeURIComponent(
                  String(info.pos),
                )}`
              : null;

            const rowStyle: React.CSSProperties = {
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: "10px 12px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
            };

            const contentStyle: React.CSSProperties = {
              color: "rgba(255,255,255,0.98)",
              fontSize: itemFontSize,
              lineHeight: itemLineHeight,
              fontWeight: 800,
              display: "flex",
              gap: 10,
              alignItems: "baseline",
            };

            const numberStyle: React.CSSProperties = {
              flex: "0 0 auto",
              minWidth: 38,
              textAlign: "right",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 900,
              letterSpacing: 0.2,
            };

            const titleStyle: React.CSSProperties = {
              flex: "1 1 auto",
              wordBreak: "break-word",
              textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            };

            return (
              <li key={listItemId} id={`item_${listItemId}`} style={rowStyle}>
                {songHref ? (
                  <Link href={songHref} style={{ ...contentStyle, textDecoration: "none" }}>
                    <span style={numberStyle}>{sortId ? `${sortId}.` : "•"}</span>
                    <span style={titleStyle}>{titleText}</span>
                  </Link>
                ) : (
                  <div style={contentStyle}>
                    <span style={numberStyle}>{sortId ? `${sortId}.` : "•"}</span>
                    <span style={{ flex: "1 1 auto", wordBreak: "break-word" }}>{titleText}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}