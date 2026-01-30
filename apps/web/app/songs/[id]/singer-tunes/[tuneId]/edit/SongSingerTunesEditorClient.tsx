"use client";

import React, { useEffect, useMemo, useState } from "react";
import UserMentionsField, { type Mention } from "@/app/components/UserMentionsField";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

// ✅ NEW: reusable tonicities UI (pills)
import TonicityPills, { type TonicityValue, normalizeTonicity } from "@/app/components/tonicity";

type SingerTuneRow = {
  id: number;
  songId: number;
  title: string;
  tune: string;
  createdAt: string;
  updatedAt: string;
};

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

async function fetchList(songId: number): Promise<SingerTuneRow[]> {
  const res = await fetch(`/api/songs/${songId}/singer-tunes`, { cache: "no-store" });
  const body = await readJson(res);
  if (!res.ok) throw new Error((body as any)?.error || (body as any)?.message || `HTTP ${res.status}`);
  return Array.isArray(body) ? (body as SingerTuneRow[]) : [];
}

async function saveOne(songId: number, payload: { id?: number; title: string; tune: string }) {
  const res = await fetch(`/api/songs/${songId}/singer-tunes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error((body as any)?.error || (body as any)?.message || `HTTP ${res.status}`);
  return body as SingerTuneRow;
}

async function deleteOne(songId: number, id: number) {
  const res = await fetch(`/api/songs/${songId}/singer-tunes?id=${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    cache: "no-store",
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error((body as any)?.error || (body as any)?.message || `HTTP ${res.status}`);
  return body;
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

function normalizeTuneForPick(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.endsWith("-") ? s.slice(0, -1) : s;
}

export default function SongSingerTunesEditorClient({ songId }: { songId: number }) {
  const [rows, setRows] = useState<SingerTuneRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [tune, setTune] = useState("");

  // ✅ UI-only mentions for title
  const [titleMentions, setTitleMentions] = useState<Mention[]>([]);

  const busy = loading || saving;

  const canSave = useMemo(() => {
    return !!title.trim() && !!normalizeTuneForPick(tune).trim() && !saving;
  }, [title, tune, saving]);

  async function reload() {
    setErr(null);
    setLoading(true);
    try {
      const data = await fetchList(songId);
      setRows(data);
    } catch (e: any) {
      setRows([]);
      setErr(e?.message || "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  function startCreate() {
    setEditId(null);
    setTitle("");
    setTune("");
    setTitleMentions([]);
    setErr(null);
  }

  function startEdit(r: SingerTuneRow) {
    setEditId(r.id);
    setTitle(r.title || "");
    setTune(normalizeTuneForPick(r.tune || ""));
    setTitleMentions([]);
    setErr(null);
  }

  function cancelEdit() {
    startCreate();
  }

  async function onDelete() {
    if (!editId) return;

    const ok = window.confirm("Διαγραφή αυτής της τονικότητας;");
    if (!ok) return;

    setErr(null);
    setSaving(true);
    try {
      await deleteOne(songId, editId);
      await reload();
      startCreate();
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία διαγραφής");
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    const cleanTitle = title.trim();
    const cleanTune = normalizeTuneForPick(tune).trim();

    if (!cleanTitle) return setErr("Ο τίτλος είναι υποχρεωτικός");
    if (!cleanTune) return setErr("Η τονικότητα είναι υποχρεωτική");

    setErr(null);
    setSaving(true);
    try {
      await saveOne(songId, {
        ...(editId ? { id: editId } : {}),
        title: cleanTitle,
        tune: cleanTune, // ✅ canonical (χωρίς "-")
      });
      await reload();
      if (!editId) startCreate();
    } catch (e: any) {
      setErr(e?.message || "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  }

  const tunePicked = normalizeTuneForPick(tune);

  return (
    <>
      <ActionBar
        left={A.backLink({ href: `/songs/${songId}`, title: "Πίσω στο τραγούδι", disabled: busy })}
        right={
          <>
            <button
              type="button"
              onClick={startCreate}
              disabled={busy}
              className="btn btn--md btn--secondary"
              style={{ whiteSpace: "nowrap" }}
            >
              Νέο
            </button>

            {A.save({
              disabled: busy || !canSave,
              loading: saving,
              onClick: onSave,
              title: editId ? "Ενημέρωση" : "Προσθήκη",
            })}

            {editId ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={busy}
                  className="btn btn--md btn--secondary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Άκυρο
                </button>

                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="btn btn--md btn--danger"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Διαγραφή
                </button>
              </>
            ) : null}
          </>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Επεξεργασία τονικοτήτων</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Τίτλος</label>

            <UserMentionsField
              value={title}
              onChange={setTitle}
              mentions={titleMentions}
              onMentionsChange={setTitleMentions}
              placeholder="π.χ. @vas… Τραγουδιστής / Label"
              disabled={busy}
              multiline={false}
              minChars={3}
              take={8}
              showMentionLinks={true}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Τονικότητα</label>

            {/* ✅ Shared pills (single source of truth) */}
            <TonicityPills
              value={tunePicked}
              onChange={(v: TonicityValue) => setTune(v)}
              disabled={busy}
              withMinus={true}
              showNaturals={true}
              showSharps={true}
            />

            {/* fallback input */}
            <div style={{ marginTop: 10 }}>
              <input
                value={tune}
                onChange={(e) => setTune(e.target.value)}
                placeholder="π.χ. Bm, Am"
                disabled={busy}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.18)",
                  padding: "0 12px",
                }}
              />
              <small style={{ fontSize: 12, color: "#888" }}>
                Μπορείς να γράψεις και custom (π.χ. Am, Bm). Οι ελληνικές επιλογές αποθηκεύονται “καθαρά” (χωρίς "-").
              </small>
            </div>
          </div>

          <InlineError message={err ?? undefined} />
        </div>
      </form>

      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Φόρτωση…</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Δεν υπάρχουν καταχωρήσεις.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{r.title}</div>
                  <div style={{ opacity: 0.75 }}>{r.tune}</div>
                </div>

                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  disabled={busy}
                  className="btn btn--md btn--secondary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Επεξεργασία
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
