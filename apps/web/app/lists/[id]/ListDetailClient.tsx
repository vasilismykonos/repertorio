// apps/web/app/lists/[id]/ListDetailClient.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import type { ListDetailDto } from "./page";

type Props = {
  listId: number;
  data: ListDetailDto;
};

function roleLabel(role: ListDetailDto["role"]) {
  if (role === "OWNER") return "Ιδιοκτήτης";
  if (role === "EDITOR") return "Επεξεργαστής";
  return "Προβολή";
}

export default function ListDetailClient({ listId, data }: Props) {
  const { title, groupTitle, marked, role, items } = data;

  const canEdit = role === "OWNER" || role === "EDITOR";

  // ✅ Song order μέσα στη λίστα: ΜΟΝΟ items με songId
  const songIdByListItemId = useMemo(() => {
    const map = new Map<number, { songId: number; pos: number }>();
    let pos = 0;

    for (const it of items ?? []) {
      const sid = Number(it.songId);
      if (Number.isFinite(sid) && sid > 0) {
        map.set(it.listItemId, { songId: sid, pos });
        pos += 1;
      }
    }

    return map;
  }, [items]);

  return (
    <section style={{ padding: "1rem" }}>
      {/* Addressbar */}
      <ActionBar
        title={title || `Λίστα #${listId}`}
        left={A.backLink({ href: "/lists", label: "Πίσω" })}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.25rem",
          }}
        >
          {marked && (
            <span
              aria-label="Αγαπημένη λίστα"
              title="Αγαπημένη λίστα"
              style={{ color: "#f5a623" }}
            >
              ★
            </span>
          )}

          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
            {title || `Λίστα #${listId}`}
          </h1>
        </div>

        <div
          style={{
            fontSize: "0.95rem",
            color: "rgba(255,255,255,0.75)",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <span>
            Ρόλος:{" "}
            <strong style={{ color: "#fff" }}>{roleLabel(role)}</strong>
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
      {items.length === 0 ? (
        <p>Η λίστα δεν περιέχει τραγούδια.</p>
      ) : (
        <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
          {items.map((item) => {
            const titleText =
              item.title || `(αντικείμενο #${item.listItemId})`;
            const displayText = `${item.sortId}. ${titleText}`;

            const info = songIdByListItemId.get(item.listItemId);
            const songHref =
              info?.songId
                ? `/songs/${info.songId}?listId=${encodeURIComponent(
                    String(listId),
                  )}&listPos=${encodeURIComponent(String(info.pos))}`
                : null;

            return (
              <li
                key={item.listItemId}
                id={`item_${item.listItemId}`}
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
