// apps/web/app/assets/AssetsPageClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Link as LinkIcon,
  Music2,
  Paperclip,
  Image as ImageIcon,
  Film,
  Plus,
} from "lucide-react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";

/* =========================
   Types (βάσει assets.service.ts mapAsset())
========================= */

export type SongMini = { id: number; title: string; slug: string };

export type ListMini = {
  id: number;
  title: string;
  legacyId: number | null;
  groupId: number | null;
};

export type ListItemMini = {
  id: number;
  title: string | null;
  listId: number;
  sortId: number;
  songId: number | null;
};

export type ListGroupMini = {
  id: number;
  title: string;
  fullTitle: string | null;
  legacyId: number | null;
};

export type AssetRow = {
  id: number;
  kind: "FILE" | "LINK";
  type: string;
  title: string | null;
  url: string | null;
  filePath: string | null;
  sizeBytes: string | null;
  createdAt: string;

  songs: SongMini[];
  lists: ListMini[];
  listItems: ListItemMini[];
  listGroups: ListGroupMini[];
};

export type ApiResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: AssetRow[];
};

type Props = {
  initialQuery: { q: string; kind: string; type: string; unlinked: string; page: number };
  data: ApiResponse;
};

function iconFor(a: AssetRow) {
  const t = String(a.type ?? "").toUpperCase();
  if (a.kind === "LINK") return LinkIcon;
  if (t === "AUDIO") return Music2;
  if (t === "IMAGE") return ImageIcon;
  if (t === "PDF" || t === "SCORE") return FileText;
  if (t === "VIDEO") return Film;
  return Paperclip;
}

type JoinChip = {
  kind: "SONG" | "LIST" | "LIST_ITEM" | "LIST_GROUP";
  label: string;
  href: string | null;
};

function buildJoinChips(a: AssetRow): JoinChip[] {
  const chips: JoinChip[] = [];

  for (const s of a.songs ?? []) {
    chips.push({ kind: "SONG", label: s.title || `Song #${s.id}`, href: `/songs/${s.id}` });
  }

  for (const l of a.lists ?? []) {
    chips.push({ kind: "LIST", label: l.title || `List #${l.id}`, href: `/lists/${l.id}` });
  }

  for (const g of a.listGroups ?? []) {
    chips.push({
      kind: "LIST_GROUP",
      label: g.fullTitle || g.title || `Group #${g.id}`,
      href: `/lists/groups/${g.id}`,
    });
  }

  // Δεν υπάρχει route για list-item detail στα αρχεία του zip,
  // οπότε το link πάει στη λίστα.
  for (const li of a.listItems ?? []) {
    const label =
      li.title ||
      (li.songId ? `List item (song ${li.songId})` : `List item #${li.id}`);
    chips.push({ kind: "LIST_ITEM", label, href: li.listId ? `/lists/${li.listId}` : null });
  }

  return chips;
}

function joinKindsLabel(chips: JoinChip[]): string {
  const set = new Set(chips.map((c) => c.kind));
  const order: JoinChip["kind"][] = ["SONG", "LIST", "LIST_GROUP", "LIST_ITEM"];
  return order.filter((k) => set.has(k)).join(", ");
}

export default function AssetsPageClient({ initialQuery, data }: Props) {
  const router = useRouter();

  const [q, setQ] = useState(initialQuery.q);
  const [kind, setKind] = useState(initialQuery.kind);
  const [type, setType] = useState(initialQuery.type);
  const [unlinked, setUnlinked] = useState(
    initialQuery.unlinked === "1" || initialQuery.unlinked === "true",
  );

  const items = data?.items ?? [];
  const total = Number(data?.total ?? 0);

  function apply() {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (kind) qs.set("kind", kind);
    if (type) qs.set("type", type);
    if (unlinked) qs.set("unlinked", "1");
    qs.set("page", "1");
    router.push(`/assets?${qs.toString()}`);
  }

  const right = useMemo(() => {
    return (
      <Link href="/assets/new" title="Νέο Υλικό" style={{ textDecoration: "none" }}>
        <Button type="button" variant="secondary" icon={Plus}>
          Νέο
        </Button>
      </Link>
    );
  }, []);

  return (
    <section style={{ padding: "0px 10px", maxWidth: 1000, margin: "0 auto" }}>
      <ActionBar
        left={<>{A.backLink({ href: "/songs", title: "Πίσω", label: "Πίσω" })}</>}
        right={right}
      />

      {/* Filters */}
      <div
        style={{
          marginTop: 10,
          border: "1px solid #222",
          background: "#0f0f0f",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 10,
        }}
      >
        <div style={{ gridColumn: "span 6" }}>
          <input
            className="song-edit-input-light"
            placeholder="Αναζήτηση τίτλου / url / path…"
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            onKeyDown={(e) => (e.key === "Enter" ? apply() : null)}
          />
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <select
            className="song-edit-input-light"
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value)}
          >
            <option value="">Kind</option>
            <option value="FILE">FILE</option>
            <option value="LINK">LINK</option>
          </select>
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <select
            className="song-edit-input-light"
            value={type}
            onChange={(e) => setType(e.currentTarget.value)}
          >
            <option value="">Type</option>
            <option value="PDF">PDF</option>
            <option value="SCORE">SCORE</option>
            <option value="AUDIO">AUDIO</option>
            <option value="IMAGE">IMAGE</option>
            <option value="VIDEO">VIDEO</option>
          </select>
        </div>

        <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={unlinked}
              onChange={(e) => setUnlinked(e.currentTarget.checked)}
            />
            <span style={{ fontSize: 13, opacity: 0.9 }}>Unlinked</span>
          </label>

          <Button type="button" variant="secondary" onClick={apply}>
            Apply
          </Button>
        </div>
      </div>

      {/* Results */}
      <div style={{ marginTop: 12, opacity: 0.9, fontSize: 13 }}>
        Σύνολο: <b>{total}</b>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {items.map((a) => {
          const Icon = iconFor(a);
          const title = a.title || a.url || a.filePath || `Asset #${a.id}`;

          const chips = buildJoinChips(a);
          const joinKinds = joinKindsLabel(chips);

          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/assets/${a.id}/edit`)}
              onKeyDown={(e) => (e.key === "Enter" ? router.push(`/assets/${a.id}/edit`) : null)}
              style={{
                border: "1px solid #222",
                background: "#0f0f0f",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                <Icon size={18} />
              </div>

              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div
                  style={{
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {title}
                </div>

                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                  {a.kind} · {a.type}
                  {joinKinds ? ` · Join: ${joinKinds}` : ""}
                </div>

                {chips.length ? (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {chips.map((c, idx) => {
                      const prefix =
                        c.kind === "SONG"
                          ? "Song"
                          : c.kind === "LIST"
                            ? "List"
                            : c.kind === "LIST_GROUP"
                              ? "Group"
                              : "List item";

                      const pillStyle: React.CSSProperties = {
                        fontSize: 12,
                        border: "1px solid #2a2a2a",
                        background: "#121212",
                        borderRadius: 999,
                        padding: "4px 10px",
                        maxWidth: "100%",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "inherit",
                        textDecoration: "none",
                        opacity: 0.95,
                      };

                      const text = `${prefix}: ${c.label}`;

                      if (!c.href) {
                        return (
                          <span key={`${c.kind}-${idx}`} style={pillStyle} title={c.label}>
                            {text}
                          </span>
                        );
                      }

                      return (
                        <Link key={`${c.kind}-${idx}`} href={c.href} style={pillStyle} title={c.label}>
                          {text}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}