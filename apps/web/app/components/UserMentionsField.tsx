"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { searchUsers } from "@/lib/users/searchUsers";

/** Minimal “pick” type */
type UserPick = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type Mention = {
  userId: number;
  label: string; // π.χ. "@Vasilis"
};

type Props = {
  value: string;
  onChange: (v: string) => void;

  /** UI-only: resolved mentions ώστε να κάνεις link προς /users/[id] */
  mentions: Mention[];
  onMentionsChange: (m: Mention[]) => void;

  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;

  minChars?: number; // default 3
  take?: number; // default 8
  debounceMs?: number; // default 180

  /** δείξε chips/links κάτω από το πεδίο */
  showMentionLinks?: boolean;
};

function getCaret(el: HTMLInputElement | HTMLTextAreaElement) {
  return typeof el.selectionStart === "number" ? el.selectionStart : null;
}

function getActiveMentionToken(text: string, caret: number | null) {
  if (caret == null) return null;
  const left = text.slice(0, caret);

  // whitespace boundary + @ + allowed chars
  const m = left.match(/(^|\s)(@[\p{L}\p{N}_.-]{1,})$/u);
  if (!m) return null;

  const full = m[2]; // "@xxx"
  const query = full.slice(1); // "xxx"
  const start = left.length - full.length;
  const end = left.length;
  return { full, query, start, end };
}

function uniqMentions(list: Mention[]) {
  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const m of list) {
    const k = `${m.userId}:${m.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

export function MentionedText({ text, mentions }: { text: string; mentions: Mention[] }) {
  const s = String(text ?? "");
  if (!mentions?.length) return <>{s}</>;

  const ordered = [...mentions].sort((a, b) => b.label.length - a.label.length);

  let parts: Array<string | { userId: number; label: string }> = [s];

  for (const m of ordered) {
    const next: typeof parts = [];
    for (const p of parts) {
      if (typeof p !== "string") {
        next.push(p);
        continue;
      }
      const chunks = p.split(m.label);
      for (let i = 0; i < chunks.length; i++) {
        next.push(chunks[i]);
        if (i !== chunks.length - 1) next.push({ userId: m.userId, label: m.label });
      }
    }
    parts = next;
  }

  return (
    <>
      {parts.map((p, idx) =>
        typeof p === "string" ? (
          <React.Fragment key={idx}>{p}</React.Fragment>
        ) : (
          <Link
            key={`${p.userId}:${idx}`}
            href={`/users/${p.userId}`}
            style={{ fontWeight: 800, textDecoration: "none" }}
            title="Άνοιγμα προφίλ"
          >
            {p.label}
          </Link>
        ),
      )}
    </>
  );
}

export default function UserMentionsField(props: Props) {
  const {
    value,
    onChange,
    mentions,
    onMentionsChange,
    placeholder,
    disabled,
    multiline,
    minChars = 3,
    take = 8,
    debounceMs = 180,
    showMentionLinks = true,
  } = props;

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastQueryRef = useRef<string>("");

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<UserPick[]>([]);
  const [active, setActive] = useState<{ query: string; start: number; end: number } | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const close = () => {
    setOpen(false);
    setSuggestions([]);
    setActive(null);
    setErr(null);
    setLoading(false);
  };

  const InputTag: any = multiline ? "textarea" : "input";

  const fieldStyle: React.CSSProperties = useMemo(
    () => ({
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box", // ✅ ΚΡΙΣΙΜΟ: σταματά το overflow δεξιά
        minHeight: multiline ? 90 : 40,
        height: multiline ? 120 : 40,
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.18)",
        padding: "10px 12px",
        resize: multiline ? "vertical" : "none",
    }),
    [multiline],
    );


  function onLocalChange(next: string) {
    onChange(next);
    setErr(null);

    const caret = inputRef.current ? getCaret(inputRef.current) : null;
    const tok = getActiveMentionToken(next, caret);

    if (!tok || tok.query.length < minChars) {
      close();
      return;
    }

    setActive({ query: tok.query, start: tok.start, end: tok.end });
    setOpen(true);
    setHighlightIdx(0);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      if (lastQueryRef.current === tok.query) return;
      lastQueryRef.current = tok.query;

      setLoading(true);
      try {
        const data = await searchUsers(tok.query, take);
        setSuggestions(data as any);
      } catch (e: any) {
        setSuggestions([]);
        setErr(e?.message || "Αποτυχία αναζήτησης χρηστών");
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  }

  function pick(u: UserPick) {
    if (!active) return;

    const labelCore = (u.displayName?.trim() || u.username || `user${u.id}`).trim();
    const label = `@${labelCore}`;

    const before = value.slice(0, active.start);
    const after = value.slice(active.end);
    const nextText = `${before}${label} ${after}`.replace(/\s{2,}/g, " ");

    onChange(nextText);

    const nextMentions = uniqMentions([...(mentions ?? []), { userId: u.id, label }]);
    onMentionsChange(nextMentions);

    close();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const hasDropdown = open && (loading || suggestions.length > 0 || !!err);

  return (
    <div style={{ position: "relative" }}>
      <InputTag
        ref={inputRef as any}
        value={value}
        onChange={(e: any) => onLocalChange(e.target.value)}
        onBlur={() => window.setTimeout(() => close(), 140)}
        onKeyDown={(e: any) => {
          if (!hasDropdown) return;

          if (e.key === "Escape") {
            e.preventDefault();
            close();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIdx((x) => Math.min(x + 1, Math.max(0, suggestions.length - 1)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIdx((x) => Math.max(x - 1, 0));
            return;
          }
          if (e.key === "Enter" && !multiline) {
            if (suggestions[highlightIdx]) {
              e.preventDefault();
              pick(suggestions[highlightIdx]);
            }
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={fieldStyle}
      />

      {hasDropdown ? (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            left: 0,
            right: 0,
            top: multiline ? 130 : 46,
            background: "#010101",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div style={{ padding: 10, opacity: 0.8 }}>Αναζήτηση…</div>
          ) : err ? (
            <div style={{ padding: 10, color: "#b00020" }}>{err}</div>
          ) : suggestions.length === 0 ? (
            <div style={{ padding: 10, opacity: 0.8 }}>Δεν βρέθηκαν χρήστες.</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {suggestions.map((u, idx) => {
                const name = (u.displayName?.trim() || u.username || `user${u.id}`).trim();
                const isActive = idx === highlightIdx;

            return (
            <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                className={`mentionsRow ${isActive ? "mentionsRow--active" : ""}`}
            >
                <div className="mentionsRow__avatar">
                {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                    src={u.avatarUrl}
                    alt=""
                    className="mentionsRow__avatarImg"
                    />
                ) : null}
                </div>

                <div className="mentionsRow__text">
                <div className="mentionsRow__name">{name}</div>
                <div className="mentionsRow__username">@{u.username}</div>
                </div>
            </button>
            );


              })}
            </div>
          )}
        </div>
      ) : null}

      {showMentionLinks && mentions?.length ? (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {mentions.map((m) => (
            <Link
              key={`${m.userId}:${m.label}`}
              href={`/users/${m.userId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.12)",
                textDecoration: "none",
                color: "inherit",
                background: "rgba(0,0,0,0.03)",
                fontWeight: 700,
              }}
              title="Άνοιγμα προφίλ"
            >
              {m.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
