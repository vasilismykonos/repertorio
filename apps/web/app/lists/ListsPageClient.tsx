// apps/web/app/lists/ListsPageClient.tsx
"use client";

import React, { useRef } from "react";
import Link from "next/link";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

import type { ListsIndexResponse } from "./page";

type Props = {
  initialSearch: string;
  initialGroupId: string;
  page: number;
  pageSize: number;

  // ✅ filtered results (items)
  data: ListsIndexResponse;

  // ✅ global facets for pills (total/groups), independent of selected groupId
  facets: ListsIndexResponse;
};

function stripTrailingCount(label: string): string {
  if (!label) return "";
  return String(label).replace(/\s*\(\d+\)\s*$/, "").trim();
}

export default function ListsPageClient({
  initialSearch,
  initialGroupId,
  page,
  pageSize,
  data,
  facets,
}: Props) {
  const search = (initialSearch ?? "").trim();
  const groupId = initialGroupId ?? "";

  // ✅ items come from filtered data
  const { items } = data;

  // ✅ pills come from facets (unfiltered by groupId)
  const facetTotal = facets.total ?? 0;
  const facetGroups = facets.groups ?? [];

  const totalFromGroups = facetGroups.reduce(
    (acc, g) => acc + (Number.isFinite(g.listsCount) ? g.listsCount : 0),
    0,
  );
  const noGroupCount = Math.max(facetTotal - totalFromGroups, 0);

  const hasPrev = page > 1;
  const hasNext = page * pageSize < (data.total ?? 0);

  function buildPageUrl(params: {
    search?: string;
    groupId?: string;
    page?: number;
  }) {
    const sp = new URLSearchParams();

    if (params.search && params.search.trim()) {
      sp.set("search", params.search.trim());
    }

    if (params.groupId !== undefined && params.groupId !== "") {
      sp.set("groupId", params.groupId);
    }

    if (params.page && params.page > 1) {
      sp.set("page", String(params.page));
    }

    const qs = sp.toString();
    return qs ? `/lists?${qs}` : "/lists";
  }

  const formRef = useRef<HTMLFormElement | null>(null);

  const groupPillFontSize = 18;

  function pillStyle(isActive: boolean): React.CSSProperties {
    return {
      padding: "6px 12px",
      borderRadius: 16,

      background: isActive ? "#0070f3" : "#222",
      color: "#fff",
      border: isActive ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.7)",

      textDecoration: "none",
      fontWeight: 600,
      fontSize: groupPillFontSize,
      lineHeight: "22px",
      display: "inline-block",
    };
  }

  return (
    <section style={{ padding: "1rem" }}>
      <ActionBar
        title="Λίστες"
        left={A.backLink({ href: "/", label: "Πίσω" })}
        right={A.link({
          href: "/lists/new",
          label: "Νέα λίστα",
          action: "new",
          variant: "primary",
        })}
      />

      {/* Φόρμα αναζήτησης */}
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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Αναζήτηση λίστας..."
            style={{
              flex: "1 1 220px",
              minWidth: "180px",
              padding: "6px 10px",
              borderRadius: 16,
              border: "1px solid #ccc",
              fontSize: 16,
            }}
          />

          {groupId && <input type="hidden" name="groupId" value={groupId} />}

          {A.search({
            label: "Αναζήτηση",
            onClick: () => formRef.current?.requestSubmit(),
          })}
        </div>
      </form>

      {/* Φίλτρα ομάδων (από facets) */}
      <div
        className="active-filters"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <Link
          href={buildPageUrl({ search, groupId: "", page: 1 })}
          style={pillStyle(!groupId)}
        >
          Όλες ({facetTotal})
        </Link>

        <Link
          href={buildPageUrl({ search, groupId: "null", page: 1 })}
          style={pillStyle(groupId === "null")}
        >
          Χωρίς ομάδα ({noGroupCount})
        </Link>

        {facetGroups.map((g) => {
          const isActive =
            groupId !== "" && groupId !== "null" && groupId === String(g.id);

          const rawLabel = g.fullTitle || g.title || `Ομάδα #${g.id}`;
          const cleanLabel = stripTrailingCount(rawLabel);

          return (
            <Link
              key={g.id}
              href={buildPageUrl({ search, groupId: String(g.id), page: 1 })}
              style={pillStyle(isActive)}
            >
              {cleanLabel} ({g.listsCount})
            </Link>
          );
        })}
      </div>

      {/* Λίστες */}
      {items.length === 0 ? (
        <p>Δεν βρέθηκαν λίστες.</p>
      ) : (
        <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
          {items.map((list) => {
            const baseStyle: React.CSSProperties = { color: "#ffffff" };
            if (list.marked) {
              baseStyle.fontSize = "1.1rem";
              baseStyle.fontWeight = "bold";
            }

            return (
              <li key={list.id} style={{ marginBottom: "0.35rem" }}>
                <Link
                  href={`/lists/${list.id}`}
                  style={{ ...baseStyle, textDecoration: "none" }}
                >
                  {list.title || `Λίστα #${list.id}`}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Σελιδοποίηση (με βάση data.total) */}
      {(data.total ?? 0) > pageSize && (
        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.95rem",
          }}
        >
          <div>
            Σελίδα {page} από {Math.max(1, Math.ceil((data.total ?? 0) / pageSize))} (
            {data.total ?? 0} λίστες)
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            {hasPrev ? (
              <Link
                href={buildPageUrl({ search, groupId, page: page - 1 })}
                style={{ color: "#fff", textDecoration: "none" }}
              >
                ← Προηγούμενη
              </Link>
            ) : (
              <span style={{ color: "#aaa" }}>← Προηγούμενη</span>
            )}

            {hasNext ? (
              <Link
                href={buildPageUrl({ search, groupId, page: page + 1 })}
                style={{ color: "#fff", textDecoration: "none" }}
              >
                Επόμενη →
              </Link>
            ) : (
              <span style={{ color: "#aaa" }}>Επόμενη →</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
