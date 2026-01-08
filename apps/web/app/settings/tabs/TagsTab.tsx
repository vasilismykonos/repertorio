"use client";

// apps/web/app/settings/tabs/TagsTab.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TagDto = { id: number; title: string; slug: string; usageCount: number };

function toStr(v: unknown): string {
  return String(v ?? "");
}

export default function TagsTab() {
  /**
   * ✅ NEW ARCH RULE:
   * Client-side calls MUST stay same-origin (avoid CORS / wrong domain).
   * Nginx proxies /api/v1 -> API server.
   */
  const apiBase = "/api/v1";

  const routes = useMemo(() => {
    return {
      list: (q: string) =>
        `${apiBase}/songs/tags?take=500&skip=0&search=${encodeURIComponent(q)}`,
      create: `${apiBase}/songs/tags`,
      update: (id: number) => `${apiBase}/songs/tags/${id}`,
      del: (id: number) => `${apiBase}/songs/tags/${id}`,
    };
  }, [apiBase]);

  const [items, setItems] = useState<TagDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  const UI = useMemo(
    () => ({
      panelBg: "transparent",
      panelBorder: "#222",
      text: "#e5e5e5",
      muted: "#a3a3a3",

      inputBg: "#000",
      inputBorder: "#333",
      inputText: "#e5e5e5",

      tableHeaderBg: "#000",
      tableHeaderBorder: "#222",
      tableRowBorder: "#222",

      btnBg: "#000",
      btnBorder: "#333",
      btnText: "#e5e5e5",

      btnPrimaryBg: "#111",
      btnPrimaryText: "#fff",
      btnPrimaryBorder: "#333",

      dangerBorder: "#7a1b1b",
      dangerText: "#ff9a9a",

      errorBg: "#2a0f0f",
      errorBorder: "#5a1a1a",
      errorText: "#ffb3b3",

      subPanelBg: "#0f0f0f",
      subPanelBorder: "#222",
    }),
    [],
  );

  const fetchList = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await fetch(routes.list(q), {
          cache: "no-store",
          signal: abortRef.current.signal,
          headers: { accept: "application/json" },
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`Tags list HTTP ${res.status}: ${t}`);
        }

        const data = (await res.json()) as TagDto[];
        setItems(
          (Array.isArray(data) ? data : [])
            .filter(
              (t) =>
                Number.isFinite(t?.id) &&
                t.id > 0 &&
                toStr(t?.title).trim() &&
                Number.isFinite(t?.usageCount ?? 0),
            )
            .sort((a, b) => a.title.localeCompare(b.title, "el")),
        );
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Αποτυχία φόρτωσης tags");
      } finally {
        setLoading(false);
      }
    },
    [routes],
  );

  useEffect(() => {
    void fetchList("");
    return () => abortRef.current?.abort();
  }, [fetchList]);

  const onCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;

    setBusy("create");
    setError(null);
    try {
      const res = await fetch(routes.create, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Tag create HTTP ${res.status}: ${t}`);
      }

      setNewTitle("");
      await fetchList(search);
    } catch (e: any) {
      setError(e?.message ?? "Αποτυχία δημιουργίας tag");
    } finally {
      setBusy(null);
    }
  }, [fetchList, newTitle, routes.create, search]);

  const startEdit = useCallback((t: TagDto) => {
    setEditingId(t.id);
    setEditingTitle(t.title);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingTitle("");
  }, []);

  const onSaveEdit = useCallback(async () => {
    const id = editingId;
    if (!id) return;

    const title = editingTitle.trim();
    if (!title) return;

    setBusy(`edit:${id}`);
    setError(null);
    try {
      const res = await fetch(routes.update(id), {
        method: "PATCH",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Tag update HTTP ${res.status}: ${t}`);
      }

      cancelEdit();
      await fetchList(search);
    } catch (e: any) {
      setError(e?.message ?? "Αποτυχία ενημέρωσης tag");
    } finally {
      setBusy(null);
    }
  }, [cancelEdit, editingId, editingTitle, fetchList, routes, search]);

  const onDelete = useCallback(
    async (t: TagDto) => {
      if (!Number.isFinite(t.id) || t.id <= 0) return;

      // ✅ UI protection
      if ((t.usageCount ?? 0) > 0) {
        setError(
          `Δεν μπορείς να διαγράψεις tag που χρησιμοποιείται (usageCount=${t.usageCount}).`,
        );
        return;
      }

      const ok = window.confirm(`Διαγραφή tag #${t.id};`);
      if (!ok) return;

      setBusy(`del:${t.id}`);
      setError(null);
      try {
        const res = await fetch(routes.del(t.id), {
          method: "DELETE",
          headers: { accept: "application/json" },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Tag delete HTTP ${res.status}: ${body}`);
        }

        if (editingId === t.id) cancelEdit();
        await fetchList(search);
      } catch (e: any) {
        setError(e?.message ?? "Αποτυχία διαγραφής tag");
      } finally {
        setBusy(null);
      }
    },
    [cancelEdit, editingId, fetchList, routes, search],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => {
      const hay = `${t.title} ${t.slug}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  return (
    <div
      style={{
        border: `1px solid ${UI.panelBorder}`,
        borderRadius: 12,
        padding: 14,
        background: UI.panelBg,
        color: UI.text,
      }}
    >
      <h2 style={{ marginTop: 0, color: UI.text }}>Διαχείριση Tags</h2>

      {error && (
        <div
          style={{
            background: UI.errorBg,
            border: `1px solid ${UI.errorBorder}`,
            color: UI.errorText,
            padding: 10,
            borderRadius: 10,
            marginBottom: 10,
            whiteSpace: "pre-wrap",
          }}
        >
          Σφάλμα: {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => void fetchList(search)}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: `1px solid ${UI.btnPrimaryBorder}`,
            background: UI.btnPrimaryBg,
            color: UI.btnPrimaryText,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "Φόρτωση..." : "Ανανέωση"}
        </button>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση (title ή slug)"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${UI.inputBorder}`,
            background: UI.inputBg,
            color: UI.inputText,
            minWidth: 260,
            outline: "none",
          }}
        />

        <div style={{ color: UI.muted, fontSize: 13, alignSelf: "center" }}>
          Σύνολο: <b>{items.length}</b> • Εμφανίζονται: <b>{filtered.length}</b>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${UI.subPanelBorder}`,
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
          background: UI.subPanelBg,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8, color: UI.text }}>
          Προσθήκη νέου tag
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Τίτλος (π.χ. Μανές)"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid ${UI.inputBorder}`,
              background: UI.inputBg,
              color: UI.inputText,
              minWidth: 260,
              outline: "none",
            }}
          />

          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy === "create" || !newTitle.trim()}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${UI.btnBorder}`,
              background: busy === "create" ? "#222" : UI.btnBg,
              color: UI.btnText,
              cursor: busy === "create" ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {busy === "create" ? "Προσθήκη..." : "Προσθήκη"}
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, fontSize: 13 }}>
          <thead>
            <tr>
              {["id", "title", "slug", "χρήση", "actions"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 8px",
                    borderBottom: `1px solid ${UI.tableHeaderBorder}`,
                    background: UI.tableHeaderBg,
                    color: UI.muted,
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((t) => {
              const isEditing = editingId === t.id;
              const rowBusy = busy === `edit:${t.id}` || busy === `del:${t.id}`;
              const inUse = (t.usageCount ?? 0) > 0;

              return (
                <tr key={t.id}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${UI.tableRowBorder}`, color: UI.text }}>
                    {t.id}
                  </td>

                  <td style={{ padding: 8, borderBottom: `1px solid ${UI.tableRowBorder}` }}>
                    {!isEditing ? (
                      <span style={{ fontWeight: 700, color: UI.text }}>{t.title}</span>
                    ) : (
                      <input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 10,
                          border: `1px solid ${UI.inputBorder}`,
                          background: UI.inputBg,
                          color: UI.inputText,
                          minWidth: 260,
                          outline: "none",
                        }}
                      />
                    )}
                  </td>

                  <td style={{ padding: 8, borderBottom: `1px solid ${UI.tableRowBorder}`, color: UI.muted }}>
                    {t.slug}
                  </td>

                  <td style={{ padding: 8, borderBottom: `1px solid ${UI.tableRowBorder}`, color: UI.text }}>
                    <span style={{ color: inUse ? UI.text : UI.muted }}>{t.usageCount ?? 0}</span>
                  </td>

                  <td style={{ padding: 8, borderBottom: `1px solid ${UI.tableRowBorder}` }}>
                    {!isEditing ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          disabled={rowBusy}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: `1px solid ${UI.btnBorder}`,
                            background: UI.btnBg,
                            color: UI.btnText,
                            cursor: rowBusy ? "not-allowed" : "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => void onDelete(t)}
                          disabled={rowBusy || inUse}
                          title={inUse ? `Δεν μπορεί να διαγραφεί (usageCount=${t.usageCount})` : "Διαγραφή"}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: `1px solid ${UI.dangerBorder}`,
                            background: UI.btnBg,
                            color: UI.dangerText,
                            cursor: rowBusy || inUse ? "not-allowed" : "pointer",
                            fontWeight: 700,
                            opacity: inUse ? 0.5 : 1,
                          }}
                        >
                          {busy === `del:${t.id}` ? "Διαγραφή..." : "Διαγραφή"}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => void onSaveEdit()}
                          disabled={busy === `edit:${t.id}` || !editingTitle.trim()}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: `1px solid ${UI.btnPrimaryBorder}`,
                            background: UI.btnPrimaryBg,
                            color: UI.btnPrimaryText,
                            cursor:
                              busy === `edit:${t.id}` || !editingTitle.trim()
                                ? "not-allowed"
                                : "pointer",
                            fontWeight: 800,
                          }}
                        >
                          {busy === `edit:${t.id}` ? "Αποθήκευση..." : "Αποθήκευση"}
                        </button>

                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={busy === `edit:${t.id}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: `1px solid ${UI.btnBorder}`,
                            background: UI.btnBg,
                            color: UI.btnText,
                            cursor: busy === `edit:${t.id}` ? "not-allowed" : "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Άκυρο
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {!loading && !filtered.length && (
              <tr>
                <td colSpan={5} style={{ padding: 10, color: UI.muted }}>
                  Δεν υπάρχουν tags για εμφάνιση.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, color: UI.muted, fontSize: 12 }}>
        Στο edit αλλάζουμε μόνο το <b>title</b> και κρατάμε το <b>slug</b> σταθερό.
      </div>
    </div>
  );
}
