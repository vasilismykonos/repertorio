// apps/web/app/songs/[id]/singer-tunes/shared/SingerTuneEditClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import { TonicityPills, type TonicityValue } from "@/app/components/tonicity";

type SingerTuneRow = {
  id: number;
  songId: number;
  title: string;
  tune: string;
  createdAt: string;
  updatedAt: string;
};

type UserOption = {
  id: number;
  name: string;
  username?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

const TITLE_MAX = 15;
const TUNE_MAX = 5;

function normalizeTune(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.endsWith("-") ? s.slice(0, -1) : s;
}

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

async function saveOne(songId: number, payload: { id?: number; title: string; tune: string }) {
  const res = await fetch(`/api/songs/${songId}/singer-tunes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg =
      body && typeof body === "object"
        ? String((body as any).error || (body as any).message || "")
        : "";
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return body as SingerTuneRow;
}

async function deleteOne(songId: number, id: number) {
  const res = await fetch(`/api/songs/${songId}/singer-tunes?id=${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    cache: "no-store",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg =
      body && typeof body === "object"
        ? String((body as any).error || (body as any).message || "")
        : "";
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return body;
}

function getMentionQueryFromTitle(value: string, caret: number) {
  const left = value.slice(0, caret);
  const m = left.match(/(^|\s)@([^\s@]{1,})$/);
  if (!m) return null;

  const query = m[2] ?? "";
  if (query.length < 3) return null;

  const start = left.lastIndexOf("@");
  if (start < 0) return null;

  return { query, start, end: caret };
}

function mentionHandle(u: UserOption) {
  const uname = (u.username || "").trim();
  if (uname) return `@${uname}`;
  return `@user${u.id}`;
}

async function fetchUsersForMention(q: string): Promise<UserOption[]> {
  const url = `/api/users?q=${encodeURIComponent(q)}&take=8`;

  const res = await fetch(url, { cache: "no-store" });
  const body = await readJson(res);

  if (!res.ok) {
    throw new Error((body as any)?.error || (body as any)?.message || `HTTP ${res.status}`);
  }

  const arr = Array.isArray(body)
    ? body
    : Array.isArray((body as any)?.items)
      ? (body as any).items
      : [];

  return arr
    .map((u: any) => ({
      id: Number(u.id),
      name: String(u.displayName || u.name || u.username || u.email || `User #${u.id}`),
      username: u.username ?? null,
      email: u.email ?? null,
      avatarUrl: u.avatarUrl ?? null,
    }))
    .filter((u: UserOption) => Number.isFinite(u.id) && u.id > 0);
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        marginTop: 12,
        background: "rgba(255,0,0,0.06)",
        border: "1px solid rgba(255,0,0,0.2)",
        padding: 10,
        borderRadius: 10,
      }}
    >
      {message}
    </div>
  );
}

export default function SingerTuneEditClient(props: {
  songId: number;
  mode: "create" | "edit";
  tuneId?: number;
  initialRow?: SingerTuneRow; // server-provided
}) {
  const { songId, mode, tuneId, initialRow } = props;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(() => {
    if (mode === "edit" && initialRow) return String(initialRow.title ?? "").slice(0, TITLE_MAX);
    return "";
  });

  // ✅ strict: allow either a valid tonicity or empty (no selection yet)
  const [tune, setTune] = useState<TonicityValue | "">(() => {
    if (mode === "edit" && initialRow) {
      const tr = normalizeTune(initialRow.tune ?? "");
      return tr && tr.length <= TUNE_MAX ? (tr as TonicityValue) : "";
    }
    return "";
  });

  // mentions state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionUsers, setMentionUsers] = useState<UserOption[]>([]);
  const [mentionActive, setMentionActive] = useState(0);

  const titleRef = React.useRef<HTMLInputElement | null>(null);
  const mentionRangeRef = React.useRef<{ start: number; end: number } | null>(null);
  const mentionReqIdRef = React.useRef(0);

  const busy = loading || saving;

  // Keep your normalization for saving + display
  const picked = useMemo(() => normalizeTune(tune), [tune]);

  const canSave = useMemo(() => {
    return !!title.trim() && !!picked.trim() && !saving;
  }, [title, picked, saving]);

  useEffect(() => {
    if (mode !== "edit") return;
    if (initialRow) return;
    if (!tuneId) return;
    setErr("Λείπουν δεδομένα αρχικοποίησης. Άνοιξε τη σελίδα από τη λίστα.");
  }, [mode, tuneId, initialRow]);

  function pickTonicity(ton: TonicityValue) {
    if (ton.length > TUNE_MAX) return;
    setTune(ton);
  }

  function closeMentions() {
    mentionRangeRef.current = null;
    setMentionOpen(false);
    setMentionQuery("");
    setMentionUsers([]);
    setMentionActive(0);
  }

  // Debounced mentions fetch
  useEffect(() => {
    if (!mentionOpen) return;

    const q = mentionQuery.trim();
    if (q.length < 3) {
      setMentionUsers([]);
      setMentionActive(0);
      return;
    }

    const reqId = ++mentionReqIdRef.current;

    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const users = await fetchUsersForMention(q);
          if (mentionReqIdRef.current !== reqId) return;
          setMentionUsers(users);
          setMentionActive(0);
        } catch {
          if (mentionReqIdRef.current !== reqId) return;
          setMentionUsers([]);
          setMentionActive(0);
        }
      })();
    }, 200);

    return () => window.clearTimeout(timer);
  }, [mentionOpen, mentionQuery]);

  const filteredMentionUsers = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (q.length < 3) return [];
    return mentionUsers.filter((u) => {
      const hay = `${u.name} ${u.username ?? ""} ${u.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mentionUsers, mentionQuery]);

  useEffect(() => {
    setMentionActive((i) => Math.min(i, Math.max(0, filteredMentionUsers.length - 1)));
  }, [filteredMentionUsers.length]);

  function applyMention(u: UserOption) {
    const range = mentionRangeRef.current;
    if (!range) return;

    const handle = mentionHandle(u);
    const before = title.slice(0, range.start);
    const after = title.slice(range.end);

    const next = (before + handle + " " + after).slice(0, TITLE_MAX);

    setTitle(next);
    closeMentions();

    requestAnimationFrame(() => {
      const el = titleRef.current;
      if (!el) return;
      el.focus();
      const pos = Math.min(before.length + handle.length + 1, next.length);
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
    });
  }

  async function onSave() {
    const cleanTitle = title.trim().slice(0, TITLE_MAX);
    const cleanTune = picked.trim();

    if (!cleanTitle) return setErr("Ο τίτλος είναι υποχρεωτικός");
    if (!cleanTune) return setErr("Η τονικότητα είναι υποχρεωτική (επίλεξε από τα κουμπιά).");
    if (cleanTune.length > TUNE_MAX) return setErr("Μη έγκυρη τονικότητα.");

    setErr(null);
    setSaving(true);
    try {
      await saveOne(songId, {
        ...(mode === "edit" ? { id: tuneId } : {}),
        title: cleanTitle,
        tune: cleanTune,
      });

      window.location.href = `/songs/${songId}/singer-tunes`;
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (mode !== "edit" || !tuneId) return;

    const ok = window.confirm("Διαγραφή αυτής της τονικότητας;");
    if (!ok) return;

    setErr(null);
    setSaving(true);
    try {
      await deleteOne(songId, tuneId);
      window.location.href = `/songs/${songId}/singer-tunes`;
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία διαγραφής");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ActionBar
        left={A.backLink({
          href: `/songs/${songId}/singer-tunes`,
          title: "Πίσω στη λίστα",
          disabled: busy,
        })}
        right={
          <>
            {A.save({
              disabled: busy || !canSave,
              loading: saving,
              onClick: onSave,
              title: mode === "edit" ? "Αποθήκευση" : "Προσθήκη",
            })}

            {A.backLink({
              href: `/songs/${songId}/singer-tunes`,
              disabled: busy,
              title: "Άκυρο",
              label: "Άκυρο",
              action: "cancel",
            })}

            {mode === "edit"
              ? A.del({
                  disabled: busy,
                  loading: saving,
                  onClick: onDelete,
                  title: "Διαγραφή",
                })
              : null}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>
        {mode === "edit" ? "Επεξεργασία τονικότητας" : "Νέα τονικότητα"}
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div style={{ maxWidth: 720 }}>
          {/* Title + mentions */}
          <div style={{ marginBottom: 12, position: "relative" }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500, color: "#ffffff" }}>
              Τίτλος (έως 15)
            </label>

            <input
              ref={titleRef}
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => {
                const v = e.target.value.slice(0, TITLE_MAX);
                setTitle(v);

                const caret = e.target.selectionStart ?? v.length;
                const mq = getMentionQueryFromTitle(v, caret);

                if (!mq) {
                  closeMentions();
                  return;
                }

                mentionRangeRef.current = { start: mq.start, end: mq.end };
                setMentionQuery(mq.query);
                setMentionOpen(true);
              }}
              onKeyDown={(e) => {
                if (!mentionOpen) return;

                if (e.key === "Escape") {
                  e.preventDefault();
                  closeMentions();
                  return;
                }

                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionActive((i) =>
                    Math.min(i + 1, Math.max(0, filteredMentionUsers.length - 1)),
                  );
                  return;
                }

                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionActive((i) => Math.max(0, i - 1));
                  return;
                }

                if (e.key === "Enter") {
                  const u = filteredMentionUsers[mentionActive];
                  if (u) {
                    e.preventDefault();
                    applyMention(u);
                  }
                }
              }}
              placeholder="π.χ. Μαρία"
              disabled={busy}
              style={{
                width: 320,
                maxWidth: "100%",
                height: 40,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.18)",
                padding: "0 12px",
              }}
            />

            <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              {title.length}/{TITLE_MAX}
            </div>

            {mentionOpen ? (
              <div className="mention-popover">
                {filteredMentionUsers.length === 0 ? (
                  <div className="mention-empty">Δεν βρέθηκαν χρήστες</div>
                ) : (
                  filteredMentionUsers.map((u, idx) => {
                    const active = idx === mentionActive;
                    const secondary = u.username || u.email || "";
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={"mention-item" + (active ? " active" : "")}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => applyMention(u)}
                        title={secondary}
                      >
                        <div className="mention-name">{u.name}</div>
                        <div className="mention-sub">{secondary}</div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>

          {/* Tune */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500, color: "#ffffff" }}>
              Τονικότητα
            </label>

            <div style={{ marginBottom: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 36,
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.18)",
                  padding: "0 12px",
                  fontWeight: 800,
                  minWidth: 110,
                }}
              >
                {picked ? `${picked}-` : "—"}
              </span>
            </div>

            {/* ✅ Shared compact pills component */}
            <TonicityPills value={tune} onChange={pickTonicity} withMinus disabled={busy} />
          </div>

          <InlineError message={err ?? undefined} />
          {loading ? <div style={{ marginTop: 12, opacity: 0.8 }}>Φόρτωση…</div> : null}
        </div>
      </form>

      <style jsx>{`
        .mention-popover {
          margin-top: 8px;
          width: 320px;
          max-width: 100%;
          border: 1px solid #333;
          background: #111;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        }
        .mention-empty {
          padding: 10px 12px;
          color: rgba(255, 255, 255, 0.75);
          font-size: 0.9rem;
        }
        .mention-item {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          background: transparent;
          border: 0;
          cursor: pointer;
          color: #fff;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .mention-item:first-child {
          border-top: 0;
        }
        .mention-item:hover {
          background: #222;
        }
        .mention-item.active {
          background: #ff4747;
        }
        .mention-name {
          font-weight: 800;
          line-height: 1.1;
        }
        .mention-sub {
          opacity: 0.75;
          font-size: 0.85rem;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </>
  );
}
