"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { A } from "@/app/components/buttons";

export type TagDto = {
  id: number;
  title: string;
  slug: string;
};

type Props = {
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
    const id = Number((t as any)?.id);
    const title = String((t as any)?.title ?? "").trim();
    const slug = String((t as any)?.slug ?? "").trim();
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!title) continue;
    if (!map.has(id)) map.set(id, { id, title, slug });
  }
  return Array.from(map.values());
}

function cleanText(s: any): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

export default function TagsEditorClient({
  initialTags,
  hiddenInputId = "tagIdsJson",
  take = 25,
}: Props) {
  const [selected, setSelected] = useState<TagDto[]>(() =>
    uniqueTags(initialTags ?? []),
  );

  // input + dropdown (ArtistPicker-like)
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TagDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const debounceRef = useRef<number | null>(null);
  const lastReqRef = useRef<number>(0);

  const selectedIds = useMemo(
    () => normalizeIds(selected.map((t) => t.id)),
    [selected],
  );

  // 1) Source of truth: selectedIds -> γράψιμο στο hidden input
  useEffect(() => {
    const el = document.getElementById(hiddenInputId) as HTMLInputElement | null;
    if (!el) return;
    el.value = JSON.stringify(selectedIds);
  }, [hiddenInputId, selectedIds]);

  async function fetchTags(search: string): Promise<TagDto[]> {
    const s = cleanText(search);

    // ✅ ΠΑΝΤΑ μέσω BFF για να μη χτυπάμε CORS (browser -> same origin)
    const upstream =
      s.length > 0
        ? `/api/songs/tags?search=${encodeURIComponent(s)}&take=${encodeURIComponent(
            String(take),
          )}`
        : `/api/songs/tags?take=${encodeURIComponent(String(take))}`;

    const res = await fetch(upstream, { credentials: "include" });
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
    const res = await fetch(`/api/songs/tags`, {
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

  function addTag(tag: TagDto) {
    setSelected((prev) => {
      if (prev.some((x) => x.id === tag.id)) return prev;
      return uniqueTags([...prev, tag]);
    });
    setQ("");
    setStatus("");
    setOpen(false);
  }

  function removeTag(tagId: number) {
    setSelected((prev) => prev.filter((t) => t.id !== tagId));
    setStatus("");
  }

  function filterOutSelected(items: TagDto[]) {
    const sel = new Set(selectedIds);
    return items.filter((t) => !sel.has(t.id));
  }

  async function loadTopTags() {
    try {
      setStatus("");
      setLoading(true);
      const items = await fetchTags("");
      setSuggestions(filterOutSelected(items));
    } catch (e) {
      console.error(e);
      setSuggestions([]);
      setStatus("Tag search failed (έλεγξε /api/songs/tags)");
    } finally {
      setLoading(false);
    }
  }

  // 2) Debounced suggestions (typing)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const text = cleanText(q);
    if (!text) {
      // όταν αδειάζει, δεν σβήνουμε τα top suggestions αν είναι ήδη ανοιχτό·
      // απλά αφήνουμε το dropdown να δείχνει ό,τι έχει (top tags).
      setStatus("");
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const reqId = Date.now();
      lastReqRef.current = reqId;

      try {
        setStatus("");
        setLoading(true);
        const items = await fetchTags(text);
        if (lastReqRef.current !== reqId) return;

        setSuggestions(filterOutSelected(items));
      } catch (e) {
        console.error(e);
        setSuggestions([]);
        setStatus("Tag search failed (έλεγξε /api/songs/tags)");
      } finally {
        if (lastReqRef.current === reqId) setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, take, selectedIds.join(",")]);

  async function addFromInput() {
    const text = cleanText(q);
    if (!text) return;

    // 1) exact match σε current suggestions
    const exact = suggestions.find(
      (t) => t.title.toLowerCase() === text.toLowerCase(),
    );
    if (exact) {
      addTag(exact);
      return;
    }

    // 2) δημιουργία στο API
    try {
      setStatus("Δημιουργία...");
      const created = await createTag(text);

      if (!Number.isFinite(created.id) || created.id <= 0 || !created.title) {
        throw new Error("Invalid created tag");
      }

      addTag(created);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Tag create failed (έλεγξε POST /api/songs/tags)");
      alert("Αποτυχία δημιουργίας tag. Έλεγξε POST /api/songs/tags.");
    }
  }

  const canCreateFromInput = cleanText(q).length > 0;

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 10,
        padding: 12,
        background: "#0f0f0f",
      }}
    >
      {/* Selected chips */}
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

              {/* keep as-is (not requested to convert to A.del) */}
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

      {/* Input + A.add (blue) */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={q}
          onFocus={() => {
            setOpen(true);
            void loadTopTags(); // ✅ top tags on focus (όπως πριν)
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addFromInput();
            }
          }}
          placeholder="Πληκτρολόγησε tag…"
          style={{ minWidth: 260 }}
        />

        {A.add({
          onClick: () => void addFromInput(),
          label: "Προσθήκη",
          title: "Προσθήκη tag",
          disabled: !canCreateFromInput,
          action: "new",
        })}

        {loading ? <small style={{ opacity: 0.7 }}>...</small> : null}
        <span style={{ opacity: 0.75, fontSize: 12 }}>{status}</span>
      </div>

      {/* Dropdown (ArtistPicker-like) */}
      {open && cleanText(q) ? (
        <div
          style={{
            border: "1px solid #444",
            borderRadius: 10,
            marginTop: 6,
            padding: 6,
            background: "#0b0b0b",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {suggestions.length === 0 && !loading ? (
            <div style={{ display: "grid", gap: 8, padding: 6 }}>
              <div style={{ opacity: 0.8 }}>Δεν βρέθηκαν αποτελέσματα.</div>

              {/* εδώ κρατάμε την ίδια λογική: create από input (όχι modal) */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addFromInput()}
                disabled={!canCreateFromInput}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #555",
                  background: "transparent",
                  cursor: canCreateFromInput ? "pointer" : "default",
                  fontSize: 13,
                  opacity: canCreateFromInput ? 1 : 0.7,
                }}
                title="Δημιουργία και προσθήκη tag"
              >
                <strong>+ Δημιουργία νέου tag</strong>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                  {cleanText(q)}
                </div>
              </button>
            </div>
          ) : (
            suggestions.slice(0, 50).map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(t)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid transparent",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                }}
                title="Προσθήκη"
              >
                <strong>{t.title}</strong>
              </button>
            ))
          )}
        </div>
      ) : null}

      {/* Popular/top suggestions chips (keep as-is per your request) */}
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
