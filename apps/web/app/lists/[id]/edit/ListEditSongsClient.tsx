// apps/web/app/lists/[id]/edit/ListEditSongsClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ListItemRow = {
  listItemId: number;
  listId: number;
  sortId: number;
  songId: number | null;
  title: string | null;
};

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

/** ✅ same-origin -> nginx proxy to API */
const API_BASE_URL = "/api/v1";

/** ====== Endpoints (must exist on API) ======
 * POST   /api/v1/lists/:id/items?userId=1        body: { songId }
 * DELETE /api/v1/lists/:id/items/:listItemId?userId=1
 */
function buildAddItemUrl(listId: number, userId: number) {
  return `${API_BASE_URL}/lists/${encodeURIComponent(String(listId))}/items?userId=${encodeURIComponent(
    String(userId),
  )}`;
}

function buildDeleteItemUrl(listId: number, listItemId: number, userId: number) {
  return `${API_BASE_URL}/lists/${encodeURIComponent(String(listId))}/items/${encodeURIComponent(
    String(listItemId),
  )}?userId=${encodeURIComponent(String(userId))}`;
}

function normalizeItemsForEdit(items: ListItemRow[]) {
  const copy = (items ?? []).slice();
  copy.sort((a, b) => (Number(a.sortId) || 0) - (Number(b.sortId) || 0));
  return copy;
}

/** ✅ return_to safety: allow ONLY relative paths */
function safeReturnTo(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  return null;
}

type Props = {
  viewerUserId: number;
  listId: number;

  initialItems: ListItemRow[];

  inputStyle: React.CSSProperties;

  onItemsChange: (items: ListItemRow[]) => void;
  onDirtyChange: (dirty: boolean) => void;

  onLocalError?: (message: string | null) => void;

  /** optional: support initial picked from server page */
  initialPickedSongId?: number | null;
};

export default function ListEditSongsClient({
  viewerUserId,
  listId,
  initialItems,
  inputStyle,
  onItemsChange,
  onDirtyChange,
  onLocalError,
  initialPickedSongId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ListItemRow[]>(() => normalizeItemsForEdit(initialItems));
  const [songQ, setSongQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // drag & drop
  const dragIdRef = useRef<number | null>(null);

  // prevent double POST in React dev strict mode
  const pickedProcessedRef = useRef<Set<number>>(new Set());

  const dirty = useMemo(() => {
    const orig = normalizeItemsForEdit(initialItems);
    if (orig.length !== items.length) return true;
    for (let i = 0; i < orig.length; i++) {
      if (Number(orig[i]?.listItemId) !== Number(items[i]?.listItemId)) return true;
    }
    return false;
  }, [items, initialItems]);

  useEffect(() => {
    onItemsChange(items);
    onDirtyChange(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dirty]);

  function setError(msg: string | null) {
    setErr(msg);
    onLocalError?.(msg);
  }

  function moveItem(listItemId: number, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((x) => Number(x.listItemId) === Number(listItemId));
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;

      const copy = prev.slice();
      const [a] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, a);
      return copy;
    });
  }

  function onDragStart(listItemId: number) {
    dragIdRef.current = listItemId;
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDrop(targetListItemId: number) {
    const fromId = dragIdRef.current;
    dragIdRef.current = null;
    if (!fromId || fromId === targetListItemId) return;

    setItems((prev) => {
      const fromIdx = prev.findIndex((x) => Number(x.listItemId) === Number(fromId));
      const toIdx = prev.findIndex((x) => Number(x.listItemId) === Number(targetListItemId));
      if (fromIdx < 0 || toIdx < 0) return prev;

      const copy = prev.slice();
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
  }

  async function removeItem(listItemId: number) {
    setError(null);

    try {
      const res = await fetch(buildDeleteItemUrl(listId, listItemId, viewerUserId), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = await readJson(res);

      if (!res.ok) {
        const msg =
          data && typeof data === "object" && ("error" in data || "message" in data)
            ? String((data as any).error || (data as any).message)
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setItems((prev) => prev.filter((x) => Number(x.listItemId) !== Number(listItemId)));
    } catch (e: any) {
      setError(e?.message || "Αποτυχία αφαίρεσης");
    }
  }

  async function addSongToList(songId: number) {
    setError(null);

    if (!Number.isFinite(songId) || songId <= 0) return;

    const exists = items.some((it) => Number(it.songId) === Number(songId));
    if (exists) return;

    try {
      const res = await fetch(buildAddItemUrl(listId, viewerUserId), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ songId }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        const msg =
          data && typeof data === "object" && ("error" in data || "message" in data)
            ? String((data as any).error || (data as any).message)
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const newItem = data as any;

      const fallback: ListItemRow = {
        listItemId: Number(newItem?.listItemId) || Date.now(),
        listId,
        sortId: items.length + 1,
        songId,
        title: String(newItem?.title ?? ""),
      };

      setItems((prev) => prev.concat([newItem && typeof newItem === "object" ? newItem : fallback]));
      setSongQ("");
    } catch (e: any) {
      setError(e?.message || "Αποτυχία προσθήκης");
    }
  }

  // ✅ handle "return from songs picker" via query param pickedSongId
  useEffect(() => {
    const pickedFromUrl = searchParams?.get("pickedSongId");
    const n = pickedFromUrl ? Number(pickedFromUrl) : NaN;

    if (!Number.isFinite(n) || n <= 0) return;
    if (pickedProcessedRef.current.has(n)) return;
    pickedProcessedRef.current.add(n);

    addSongToList(n).finally(() => {
      const sp = new URLSearchParams(searchParams?.toString() || "");
      sp.delete("pickedSongId");
      const next = sp.toString();
      router.replace(next ? `${pathname}?${next}` : pathname);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname]);

  // ✅ also support initialPickedSongId passed from server page
  useEffect(() => {
    const n = initialPickedSongId ?? null;
    if (!n || !Number.isFinite(n) || n <= 0) return;
    if (pickedProcessedRef.current.has(n)) return;
    pickedProcessedRef.current.add(n);

    addSongToList(n).finally(() => {
      const sp = new URLSearchParams(searchParams?.toString() || "");
      if (sp.get("pickedSongId") === String(n)) {
        sp.delete("pickedSongId");
        const next = sp.toString();
        router.replace(next ? `${pathname}?${next}` : pathname);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPickedSongId]);

  function goToGlobalSongsSearch() {
    const q = songQ.trim();
    if (q.length < 1) {
      setError("Γράψε κάτι για αναζήτηση.");
      return;
    }
    setError(null);

    // ✅ IMPORTANT: return_to MUST be relative for SongsSearchClient.safeReturnTo()
    const returnToRel =
      safeReturnTo(`${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`) || pathname;

    const url =
      `/songs` +
      `?search_term=${encodeURIComponent(q)}` +
      `&return_to=${encodeURIComponent(returnToRel)}` +
      `&mode=pick` +
      `&listId=${encodeURIComponent(String(listId))}`;

    window.location.href = url;
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 800, color: "#fff", marginBottom: 8, fontSize: 16 }}>Τραγούδια λίστας</div>

      {err ? (
        <div
          style={{
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.10)",
            padding: "10px 12px",
            borderRadius: 10,
            marginBottom: 12,
            color: "#fff",
          }}
        >
          <strong>Σφάλμα:</strong> {err}
        </div>
      ) : null}

      {/* Add song (redirect search) */}
      <div
        style={{
          border: "1px solid #333",
          borderRadius: 12,
          padding: 12,
          background: "#0b0b0b",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <label style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>Προσθήκη τραγουδιού</label>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={songQ}
              onChange={(e) => setSongQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  goToGlobalSongsSearch();
                }
              }}
              placeholder="Γράψε τίτλο…"
              style={inputStyle}
            />

            <button
              type="button"
              onClick={goToGlobalSongsSearch}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #fff",
                background: "#111",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
              title="Αναζήτηση στη σελίδα /songs"
            >
              Αναζήτηση
            </button>
          </div>

          <div style={{ fontSize: 13, opacity: 0.8, color: "#fff" }}>
            Θα μεταφερθείς στη σελίδα <code>/songs</code> σε picker mode. Μετά την επιλογή, θα επιστρέψεις εδώ με{" "}
            <code>pickedSongId</code>.
          </div>
        </div>
      </div>

      {/* Items reorder */}
      {items.length === 0 ? (
        <div style={{ color: "#fff", opacity: 0.85 }}>Η λίστα δεν περιέχει τραγούδια.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {items.map((it, idx) => {
            const titleText = String(it.title ?? "").trim() || `Song #${it.songId ?? "—"}`;

            return (
              <li
                key={it.listItemId}
                draggable
                onDragStart={() => onDragStart(Number(it.listItemId))}
                onDragOver={onDragOver}
                onDrop={() => onDrop(Number(it.listItemId))}
                style={{
                  border: "1px solid #333",
                  background: "#111",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
                title="Drag & drop για αλλαγή σειράς (desktop)"
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid #fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    opacity: 0.9,
                    flex: "0 0 auto",
                    cursor: "grab",
                  }}
                  aria-hidden
                >
                  ☰
                </div>

                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ color: "#fff", fontWeight: 700 }}>
                    {idx + 1}. {titleText}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                    songId: {it.songId ?? "—"} · listItemId: {it.listItemId}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                  <button
                    type="button"
                    onClick={() => moveItem(Number(it.listItemId), -1)}
                    disabled={idx === 0}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fff",
                      background: "#0b0b0b",
                      color: "#fff",
                      cursor: idx === 0 ? "not-allowed" : "pointer",
                      opacity: idx === 0 ? 0.5 : 1,
                    }}
                    title="Πάνω"
                  >
                    ↑
                  </button>

                  <button
                    type="button"
                    onClick={() => moveItem(Number(it.listItemId), +1)}
                    disabled={idx === items.length - 1}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fff",
                      background: "#0b0b0b",
                      color: "#fff",
                      cursor: idx === items.length - 1 ? "not-allowed" : "pointer",
                      opacity: idx === items.length - 1 ? 0.5 : 1,
                    }}
                    title="Κάτω"
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    onClick={() => removeItem(Number(it.listItemId))}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #fff",
                      background: "#ec1515",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                    title="Αφαίρεση"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
