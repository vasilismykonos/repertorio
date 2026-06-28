// apps/web/app/assets/AssetsPageClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileAudio,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Music2,
  Paperclip,
  Plus,
  Search,
  Youtube,
} from "lucide-react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import Button from "@/app/components/buttons/Button";

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

type AssetTypeFilter = "" | "SCORE" | "PDF" | "IMAGE" | "AUDIO" | "YOUTUBE" | "SPOTIFY" | "GENERIC";

const typeFilters: Array<{ value: AssetTypeFilter; label: string; shortLabel: string; Icon: typeof Paperclip }> = [
  { value: "", label: "Όλα", shortLabel: "Όλα", Icon: Paperclip },
  { value: "SCORE", label: "Παρτιτούρες", shortLabel: "Παρτιτούρες", Icon: Music2 },
  { value: "PDF", label: "PDF", shortLabel: "PDF", Icon: FileText },
  { value: "IMAGE", label: "Εικόνες", shortLabel: "Εικόνες", Icon: ImageIcon },
  { value: "AUDIO", label: "Ήχος", shortLabel: "Ήχος", Icon: FileAudio },
  { value: "YOUTUBE", label: "YouTube", shortLabel: "YouTube", Icon: Youtube },
  { value: "SPOTIFY", label: "Spotify", shortLabel: "Spotify", Icon: Music2 },
  { value: "GENERIC", label: "Λοιπά", shortLabel: "Λοιπά", Icon: Paperclip },
];

const typeFilterByValue = new Map(typeFilters.map((filter) => [filter.value, filter]));
const typeOrder = new Map(typeFilters.map((filter, index) => [filter.value || "ALL", index]));

const typeLabels: Record<string, string> = {
  GENERIC: "Λοιπό",
  YOUTUBE: "YouTube",
  SPOTIFY: "Spotify",
  PDF: "PDF",
  AUDIO: "Ήχος",
  IMAGE: "Εικόνα",
  SCORE: "Παρτιτούρα",
};

const kindLabels: Record<string, string> = {
  FILE: "Αρχείο",
  LINK: "Σύνδεσμος",
};

const joinKindLabels: Record<JoinChip["kind"], string> = {
  SONG: "Τραγούδι",
  LIST: "Λίστα",
  LIST_GROUP: "Ομάδα",
  LIST_ITEM: "Τραγούδι λίστας",
};

function iconFor(a: AssetRow) {
  const t = String(a.type ?? "").toUpperCase();
  if (t === "YOUTUBE") return Youtube;
  if (a.kind === "LINK") return LinkIcon;
  if (t === "AUDIO") return FileAudio;
  if (t === "IMAGE") return ImageIcon;
  if (t === "PDF" || t === "SCORE") return FileText;
  return Paperclip;
}

function formatBytes(value: string | null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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

  for (const li of a.listItems ?? []) {
    const label = li.title || (li.songId ? `Τραγούδι #${li.songId}` : `Αντικείμενο #${li.id}`);
    chips.push({ kind: "LIST_ITEM", label, href: li.listId ? `/lists/${li.listId}` : null });
  }

  return chips;
}

function linkedSummary(chips: JoinChip[]) {
  if (!chips.length) return "Χωρίς σύνδεση";
  const counts = chips.reduce<Record<string, number>>((acc, chip) => {
    acc[chip.kind] = (acc[chip.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (Object.keys(counts) as JoinChip["kind"][])
    .map((kind) => `${joinKindLabels[kind]} ${counts[kind]}`)
    .join(" · ");
}

function hasLinks(a: AssetRow) {
  return Boolean(
    (a.songs?.length ?? 0) ||
      (a.lists?.length ?? 0) ||
      (a.listItems?.length ?? 0) ||
      (a.listGroups?.length ?? 0),
  );
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
  const page = Math.max(1, Number(data?.page ?? initialQuery.page ?? 1));
  const pageSize = Math.max(1, Number(data?.pageSize ?? 50));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageStats = useMemo(() => {
    const linked = items.filter(hasLinks).length;
    const unlinkedCount = items.length - linked;
    const fileCount = items.filter((item) => item.kind === "FILE").length;
    const linkCount = items.filter((item) => item.kind === "LINK").length;

    return [
      { label: "Στην τρέχουσα σελίδα", value: items.length, hint: `${fileCount} αρχεία · ${linkCount} σύνδεσμοι` },
      { label: "Συνδεδεμένα", value: linked, hint: "με τραγούδια, λίστες ή ομάδες" },
      { label: "Χωρίς σύνδεση", value: unlinkedCount, hint: "θέλουν έλεγχο ή αντιστοίχιση" },
    ];
  }, [items]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, AssetRow[]>();
    for (const item of items) {
      const key = String(item.type || "GENERIC").toUpperCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const aOrder = typeOrder.get(a) ?? 999;
        const bOrder = typeOrder.get(b) ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.localeCompare(b);
      })
      .map(([key, groupItems]) => ({
        key,
        label: typeFilterByValue.get(key as AssetTypeFilter)?.label ?? typeLabels[key] ?? key,
        Icon: typeFilterByValue.get(key as AssetTypeFilter)?.Icon ?? Paperclip,
        items: groupItems,
      }));
  }, [items]);

  function buildHref(next?: Partial<{ q: string; kind: string; type: string; unlinked: boolean; page: number }>) {
    const qs = new URLSearchParams();
    const nextQ = next?.q ?? q;
    const nextKind = next?.kind ?? kind;
    const nextType = next?.type ?? type;
    const nextUnlinked = next?.unlinked ?? unlinked;
    const nextPage = next?.page ?? page;

    if (nextQ.trim()) qs.set("q", nextQ.trim());
    if (nextKind) qs.set("kind", nextKind);
    if (nextType) qs.set("type", nextType);
    if (nextUnlinked) qs.set("unlinked", "1");
    qs.set("page", String(Math.max(1, nextPage)));

    return `/assets?${qs.toString()}`;
  }

  function apply(next?: Partial<{ q: string; kind: string; type: string; unlinked: boolean; page: number }>) {
    router.push(buildHref({ ...next, page: next?.page ?? 1 }));
  }

  const right = useMemo(() => {
    return (
      <Link href="/assets/new" title="Νέο υλικό" style={{ textDecoration: "none" }}>
        <Button type="button" variant="secondary" icon={Plus}>
          Νέο
        </Button>
      </Link>
    );
  }, []);

  function renderAssetRow(a: AssetRow) {
    const Icon = iconFor(a);
    const title = a.title || a.url || a.filePath || `Υλικό #${a.id}`;
    const chips = buildJoinChips(a);
    const size = formatBytes(a.sizeBytes);
    const linked = chips.length > 0;

    return (
      <div
        key={a.id}
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/assets/${a.id}/edit`)}
        onKeyDown={(e) => (e.key === "Enter" ? router.push(`/assets/${a.id}/edit`) : null)}
        style={{
          border: linked ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(245,158,11,0.45)",
          background: linked ? "#0f0f0f" : "linear-gradient(90deg, rgba(245,158,11,0.12), #0f0f0f 38%)",
          borderRadius: 8,
          padding: 12,
          display: "grid",
          gridTemplateColumns: "42px minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          maxWidth: "100%",
          minWidth: 0,
        }}
        className="asset-row"
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: a.type === "SCORE" ? "#67e8f9" : "#fff",
          }}
        >
          <Icon size={19} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 850,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontSize: 16,
            }}
            title={title}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 4,
              display: "flex",
              flexWrap: "wrap",
              gap: "5px 8px",
              color: "rgba(255,255,255,0.68)",
              fontSize: 12,
            }}
          >
            <span>{kindLabels[a.kind] ?? a.kind}</span>
            <span>·</span>
            <span>{typeLabels[a.type] ?? a.type}</span>
            {size ? (
              <>
                <span>·</span>
                <span>{size}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{formatDate(a.createdAt)}</span>
            <span>·</span>
            <span style={{ color: linked ? "inherit" : "#fbbf24", fontWeight: linked ? 500 : 800 }}>
              {linkedSummary(chips)}
            </span>
          </div>

          {chips.length ? (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                flexWrap: "wrap",
                gap: 7,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {chips.slice(0, 6).map((c, idx) => {
                const text = `${joinKindLabels[c.kind]}: ${c.label}`;
                const pillStyle: React.CSSProperties = {
                  fontSize: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "#171717",
                  borderRadius: 999,
                  padding: "4px 9px",
                  maxWidth: "100%",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "inherit",
                  textDecoration: "none",
                };

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
              {chips.length > 6 ? (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", alignSelf: "center" }}>
                  +{chips.length - 6}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.62)",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
          className="asset-row-id"
        >
          #{a.id}
        </div>
      </div>
    );
  }

  return (
    <section style={{ padding: "0 10px 24px", maxWidth: 1120, margin: "0 auto", overflowX: "hidden" }}>
      <ActionBar
        left={<>{A.backLink({ href: "/songs", title: "Πίσω", label: "Πίσω" })}</>}
        right={right}
      />

      <div style={{ marginTop: 6, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.05 }}>
          Υλικά
        </h1>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          Διαχείριση αρχείων, παρτιτούρων και συνδέσμων που είναι συνδεδεμένα με τραγούδια, λίστες ή ομάδες.
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.14)",
          background: "#101010",
          borderRadius: 8,
          padding: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: "100%", minWidth: 0 }}>
          {typeFilters.map((filter) => {
            const selected = type === filter.value;
            const Icon = filter.Icon;
            return (
              <button
                key={filter.value || "all"}
                type="button"
                onClick={() => {
                  setType(filter.value);
                  apply({ type: filter.value });
                }}
                style={{
                  border: selected ? "1px solid #0ea5b7" : "1px solid rgba(255,255,255,0.16)",
                  background: selected ? "rgba(14,165,183,0.18)" : "#181818",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "9px 11px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 14,
                  fontWeight: selected ? 800 : 650,
                  cursor: "pointer",
                  boxShadow: selected ? "0 0 0 1px rgba(14,165,183,0.28) inset" : "none",
                }}
                aria-pressed={selected}
                title={filter.label}
              >
                <Icon size={16} />
                {filter.shortLabel}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          <label style={{ position: "relative", minWidth: 0, flex: "1 1 280px", maxWidth: "100%" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#222",
                pointerEvents: "none",
              }}
            />
            <input
              className="song-edit-input-light"
              placeholder="Αναζήτηση τίτλου, URL ή αρχείου"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              onKeyDown={(e) => (e.key === "Enter" ? apply({ q: e.currentTarget.value }) : null)}
              style={{ paddingLeft: 34, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}
            />
          </label>

          <select
            className="song-edit-input-light"
            value={kind}
            onChange={(e) => {
              setKind(e.currentTarget.value);
              apply({ kind: e.currentTarget.value });
            }}
            style={{ flex: "0 1 190px", minWidth: 160 }}
          >
            <option value="">Αρχεία και σύνδεσμοι</option>
            <option value="FILE">Μόνο αρχεία</option>
            <option value="LINK">Μόνο σύνδεσμοι</option>
          </select>

          <div
            className="assets-filter-actions"
            style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", minWidth: 0, flex: "1 1 230px" }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                whiteSpace: "nowrap",
                color: "rgba(255,255,255,0.88)",
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={unlinked}
                onChange={(e) => {
                  setUnlinked(e.currentTarget.checked);
                  apply({ unlinked: e.currentTarget.checked });
                }}
              />
              Χωρίς σύνδεση
            </label>

            <Button type="button" variant="secondary" onClick={() => apply()}>
              Αναζήτηση
            </Button>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
          color: "rgba(255,255,255,0.82)",
          fontSize: 13,
        }}
      >
        <div>
          Βρέθηκαν <b>{total}</b> υλικά
          {type ? ` · ${typeLabels[type] ?? type}` : ""}
        </div>
        <div>
          Σελίδα {page} / {totalPages}
        </div>
      </div>

      <div className="asset-stats-grid">
        {pageStats.map((stat) => (
          <div key={stat.label} className="asset-stat-card">
            <div className="asset-stat-value">{stat.value}</div>
            <div className="asset-stat-label">{stat.label}</div>
            <div className="asset-stat-hint">{stat.hint}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {items.length ? (
          groupedItems.map((group) => {
            const Icon = group.Icon;
            return (
              <section key={group.key} className="asset-group">
                {!type ? (
                  <div className="asset-group-title">
                    <span className="asset-group-icon">
                      <Icon size={16} />
                    </span>
                    <span>{group.label}</span>
                    <span className="asset-group-count">{group.items.length}</span>
                  </div>
                ) : null}
                <div style={{ display: "grid", gap: 10 }}>{group.items.map(renderAssetRow)}</div>
              </section>
            );
          })
        ) : (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "#0f0f0f",
              borderRadius: 8,
              padding: 18,
              color: "rgba(255,255,255,0.78)",
            }}
          >
            Δεν βρέθηκαν υλικά με αυτά τα φίλτρα.
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "center",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => router.push(buildHref({ page: page - 1 }))}
          >
            Πίσω
          </Button>
          <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 13 }}>
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => router.push(buildHref({ page: page + 1 }))}
          >
            Επόμενα
          </Button>
        </div>
      ) : null}

      <style jsx>{`
        .asset-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        .asset-stat-card {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: #101010;
          border-radius: 8px;
          padding: 10px 12px;
          min-width: 0;
        }

        .asset-stat-value {
          color: #fff;
          font-size: 22px;
          font-weight: 900;
          line-height: 1;
        }

        .asset-stat-label {
          margin-top: 6px;
          color: rgba(255, 255, 255, 0.88);
          font-size: 13px;
          font-weight: 800;
        }

        .asset-stat-hint {
          margin-top: 3px;
          color: rgba(255, 255, 255, 0.58);
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .asset-group {
          display: grid;
          gap: 8px;
        }

        .asset-group-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 900;
          margin: 6px 0 0;
        }

        .asset-group-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #67e8f9;
        }

        .asset-group-count {
          color: rgba(255, 255, 255, 0.58);
          font-size: 12px;
          font-weight: 800;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          padding: 2px 8px;
        }

        @media (max-width: 720px) {
          .asset-stats-grid {
            grid-template-columns: 1fr;
          }

          .assets-filter-actions {
            justify-content: flex-start !important;
            flex-wrap: wrap;
          }

          .asset-row {
            grid-template-columns: 38px minmax(0, 1fr) !important;
          }

          .asset-row-id {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
