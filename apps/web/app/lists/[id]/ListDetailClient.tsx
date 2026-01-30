// apps/web/app/lists/[id]/ListDetailClient.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import type { ListDetailDto } from "./page";

type Props = {
  listId: number;
  viewerUserId: number; // ✅ το page.tsx το περνάει, άρα πρέπει να υπάρχει
  data: ListDetailDto;
};

function roleLabel(role: ListDetailDto["role"]) {
  if (role === "OWNER") return "Ιδιοκτήτης";
  if (role === "EDITOR") return "Επεξεργαστής";
  return "Προβολή";
}

export default function ListDetailClient({ listId, viewerUserId, data }: Props) {
  // viewerUserId μπορεί να μη χρειάζεται άμεσα εδώ, αλλά θέλουμε να περνάει σωστά
  void viewerUserId;

  const { title, groupTitle, marked, role, items } = data;

  const canEdit = role === "OWNER" || role === "EDITOR";

  // ✅ Song order μέσα στη λίστα: ΜΟΝΟ items με songId
  const songIdByListItemId = useMemo(() => {
    const map = new Map<number, { songId: number; pos: number }>();
    let pos = 0;

    for (const it of items ?? []) {
      const sid = Number((it as any).songId);
      if (Number.isFinite(sid) && sid > 0) {
        map.set((it as any).listItemId, { songId: sid, pos });
        pos += 1;
      }
    }

    return map;
  }, [items]);

  const headerTitle = title || `Λίστα #${listId}`;

  return (
    <section style={{ padding: "1rem" }}>
      {/* Addressbar (ActionBar δεν έχει title prop στο dev σου) */}
      <ActionBar
        left={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {A.backLink({ href: "/lists", label: "Πίσω" })}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {marked ? (
                <span
                  aria-label="Αγαπημένη λίστα"
                  title="Αγαπημένη λίστα"
                  style={{ color: "#f5a623", fontSize: 18, lineHeight: 1 }}
                >
                  ★
                </span>
              ) : null}

              <span style={{ fontWeight: 700 }}>{headerTitle}</span>
            </div>
          </div>
        }
        right={
          canEdit
            ? A.link({
                href: `/lists/${listId}/edit`,
                label: "Επεξεργασία",
                action: "edit",
                variant: "secondary",
              })
            : undefined
        }
      />

      {/* Header */}
      <header style={{ margin: "0.75rem 0 1rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
          {headerTitle}
        </h1>

        <div
          style={{
            fontSize: "0.95rem",
            color: "rgba(255,255,255,0.75)",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            marginTop: 6,
          }}
        >
          <span>
            Ρόλος: <strong style={{ color: "#fff" }}>{roleLabel(role)}</strong>
          </span>

          <span>
            Ομάδα:{" "}
            <strong style={{ color: "#fff" }}>
              {groupTitle ? groupTitle : "Χωρίς ομάδα"}
            </strong>
          </span>
        </div>
      </header>

      {/* Items */}
      {(!items || items.length === 0) ? (
        <p>Η λίστα δεν περιέχει τραγούδια.</p>
      ) : (
        <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
          {items.map((item: any) => {
            const listItemId = Number(item.listItemId);
            const sortId = item.sortId ?? "";
            const titleText = item.title || `(αντικείμενο #${listItemId})`;
            const displayText = `${sortId}. ${titleText}`;

            const info = songIdByListItemId.get(listItemId);
            const songHref =
              info?.songId
                ? `/songs/${info.songId}?listId=${encodeURIComponent(
                    String(listId),
                  )}&listPos=${encodeURIComponent(String(info.pos))}`
                : null;

            return (
              <li
                key={listItemId}
                id={`item_${listItemId}`}
                style={{ padding: "0.35rem 0" }}
              >
                {songHref ? (
                  <Link
                    href={songHref}
                    style={{ textDecoration: "none", color: "#fff" }}
                  >
                    {displayText}
                  </Link>
                ) : (
                  <span style={{ color: "#fff" }}>{displayText}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
