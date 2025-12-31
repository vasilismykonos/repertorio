"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type TagDto = {
  id: number;
  title: string;
  slug: string;
};

type Props = {
  apiBaseUrl: string; // π.χ. https://api.repertorio.net/api/v1 (χωρίς trailing /)
  initialTags: TagDto[];
  hiddenInputId?: string; // default tagIdsJson
  take?: number; // default 25
};

function normalizeIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const ids = input
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.trunc(n));
  return Array.from(new Set(ids));
}

function uniqueTags(tags: TagDto[]): TagDto[] {
  const map = new Map<number, TagDto>();
  for (const t of tags || []) {
    const id = Number(t?.id);
    const title = String(t?.title ?? "").trim();
    const slug = String(t?.slug ?? "").trim();
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!title) continue;
    if (!map.has(id)) map.set(id, { id, title, slug });
  }
  return Array.from(map.values());
}

export default function TagsEditorClient({
  apiBaseUrl,
  initialTags,
  hiddenInputId = "tagIdsJson",
  take = 25,
}: Props) {
  const [selected, setSelected] = useState<TagDto[]>(() => uniqueTags(initialTags ?? []));
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TagDto[]>([]);
  const [status, setStatus] = useState<string>("");

  const debounceRef = useRef<number | null>(null);

  const selectedIds = useMemo(() => normalizeIds(selected.map((t) => t.id)), [selected]);

  // 1) Source of truth: selectedIds -> γράψιμο στο hidden input
  useEffect(() => {
    const el = document.getElementById(hiddenInputId) as HTMLInputElement | null;
    if (!el) return;
    el.value = JSON.stringify(selectedIds);
  }, [hiddenInputId, selectedIds]);

  async function fetchTags(search: string): Promise<TagDto[]> {
    const s = search.trim();
    const url =
      s.length > 0
        ? `${apiBaseUrl}/songs/tags?search=${encodeURIComponent(s)}&take=${encodeURIComponent(String(take))}`
        : `${apiBaseUrl}/songs/tags?take=${encodeURIComponent(String(take))}`;

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Tag search failed: HTTP ${res.status}`);

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];

    return data
      .map((x: any) => ({
        id: Number(x?.id),
        title: String(x?.title ?? "").trim(),
        slug: String(x?.slug ?? "").trim(),
      }))
      .filter((t) => Number.isFinite(t.id) && t.id > 0 && t.title.length > 0);
  }

  async function createTag(title: string): Promise<TagDto> {
    const res = await fetch(`${apiBaseUrl}/songs/tags`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!res.ok) throw new Error(`Tag create failed: HTTP ${res.status}`);

    const x = (await res.json()) as any;
    return {
      id: Number(x?.id),
      title: String(x?.title ?? "").trim(),
      slug: String(x?.slug ?? "").trim(),
    };
  }

  // 2) Debounced suggestions (typing)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      try {
        setStatus("");
        const items = await fetchTags(query);

        const sel = new Set(selectedIds);
        setSuggestions(items.filter((t) => !sel.has(t.id)));
      } catch (e) {
        console.error(e);
        setSuggestions([]);
        setStatus("Tag search failed (έλεγξε endpoint /songs/tags)");
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, apiBaseUrl, take, selectedIds.join(",")]);

  async function loadTopTags() {
    try {
      setStatus("");
      const items = await fetchTags("");
      const sel = new Set(selectedIds);
      setSuggestions(items.filter((t) => !sel.has(t.id)));
    } catch (e) {
      console.error(e);
      setSuggestions([]);
      setStatus("Tag search failed (έλεγξε endpoint /songs/tags)");
    }
  }

  function addTag(tag: TagDto) {
    setSelected((prev) => {
      if (prev.some((x) => x.id === tag.id)) return prev;
      return uniqueTags([...prev, tag]);
    });
    setQuery("");
    setStatus("");
  }

  function removeTag(tagId: number) {
    setSelected((prev) => prev.filter((t) => t.id !== tagId));
    setStatus("");
  }

  async function addFromInput() {
    const q = query.trim();
    if (!q) return;

    // 1) exact match σε suggestions
    const exact = suggestions.find((t) => t.title.toLowerCase() === q.toLowerCase());
    if (exact) {
      addTag(exact);
      return;
    }

    // 2) δημιουργία στο API
    try {
      setStatus("Δημιουργία...");
      const created = await createTag(q);

      if (!Number.isFinite(created.id) || created.id <= 0 || !created.title) {
        throw new Error("Invalid created tag");
      }

      addTag(created);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Tag create failed (έλεγξε POST /songs/tags)");
      alert("Αποτυχία δημιουργίας tag. Έλεγξε POST /songs/tags.");
    }
  }

  return (
    <div style={{ border: "1px solid #333", borderRadius: 10, padding: 12, background: "#0f0f0f" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {selected.length === 0 ? (
          <span style={{ opacity: 0.8 }}>Δεν υπάρχουν tags.</span>
        ) : (
          selected.map((t) => (
            <span
              key={t.id}
              style={{
                border: "1px solid #444",
                borderRadius: 999,
                padding: "4px 10px",
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span>{t.title}</span>
              <button
                type="button"
                onClick={() => removeTag(t.id)}
                style={{
                  border: "1px solid #555",
                  borderRadius: 999,
                  padding: "0px 8px",
                  background: "transparent",
                  cursor: "pointer",
                }}
                aria-label={`Αφαίρεση tag ${t.title}`}
                title="Αφαίρεση"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={query}
          onFocus={loadTopTags}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addFromInput();
            }
          }}
          placeholder="Πληκτρολόγησε tag…"
          list="tagSuggestions"
          style={{ minWidth: 260 }}
        />

        <datalist id="tagSuggestions">
          {suggestions.map((t) => (
            <option key={t.id} value={t.title} />
          ))}
        </datalist>

        <button type="button" onClick={() => void addFromInput()}>
          Προσθήκη
        </button>

        <span style={{ opacity: 0.75, fontSize: 12 }}>{status}</span>

        
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {suggestions.slice(0, 12).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => addTag(t)}
              style={{
                border: "1px solid #444",
                borderRadius: 999,
                padding: "4px 10px",
                background: "transparent",
                cursor: "pointer",
              }}
              title="Προσθήκη"
            >
              + {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
