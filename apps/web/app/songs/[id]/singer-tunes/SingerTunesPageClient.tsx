// /home/reperto/repertorio-dev/apps/web/app/songs/[id]/singer-tunes/SingerTunesPageClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import UserMentionsField, { type Mention } from "@/app/components/UserMentionsField";
import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import TonicityPills, {
  type TonicityValue,
  normalizeTonicity,
} from "@/app/components/tonicity";

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

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function fetchList(songId: number): Promise<ApiResult<SingerTuneRow[]>> {
  const res = await fetch(`/api/songs/${songId}/singer-tunes`, {
    cache: "no-store",
  });
  const body = await readJson(res);

  if (!res.ok) {
    const msg =
      (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  const rows = Array.isArray(body) ? (body as SingerTuneRow[]) : [];
  return { ok: true, data: rows };
}

async function saveOne(
  songId: number,
  payload: { id?: number; title: string; tune: string }
): Promise<ApiResult<SingerTuneRow>> {
  const res = await fetch(`/api/songs/${songId}/singer-tunes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg =
      (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: body as SingerTuneRow };
}

async function deleteOne(songId: number, id: number): Promise<ApiResult<unknown>> {
  const res = await fetch(
    `/api/songs/${songId}/singer-tunes?id=${encodeURIComponent(String(id))}`,
    {
      method: "DELETE",
      cache: "no-store",
    }
  );

  const body = await readJson(res);

  if (!res.ok) {
    const msg =
      (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: body };
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

function ModalShell({
  open,
  title,
  onClose,
  children,
  footer,
  busy,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!busy) onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        overflowX: "hidden",
      }}
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      {/* OUTER: ΔΕΝ κόβει overflow -> dropdowns φαίνονται πλήρως */}
      <div
        style={{
          width: "min(820px, 100%)",
          maxWidth: "100%",
          boxSizing: "border-box",
          borderRadius: 14,
          boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
          border: "1px solid rgb(244, 244, 244)",
          overflow: "visible", // ✅ κρίσιμο: να μη κόβει dropdown
          position: "relative",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* INNER: κρατά rounded + background του panel */}
        <div
          style={{
            background: "#000000",
            borderRadius: 14,
            overflow: "hidden", // ✅ κόβει ΜΟΝΟ το panel (όχι dropdowns που είναι έξω από αυτό)
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 14px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>
              {title}
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={!!busy}
              className="btn btn--sm btn--secondary"
              title="Κλείσιμο"
              aria-label="Κλείσιμο"
            >
              ✕
            </button>
          </div>

          {/* Body (ΜΗΝ βάζεις overflow hidden εδώ) */}
          <div style={{ padding: 14, position: "relative" }}>{children}</div>

          {/* Footer */}
          {footer ? (
            <div
              style={{
                padding: 14,
                borderTop: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


export function SongSingerTunesEditorClient({ songId }: { songId: number }) {
  const { status } = useSession();

  const [rows, setRows] = useState<SingerTuneRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [authRequired, setAuthRequired] = useState(false);

  // ✅ modal state
  const [modalOpen, setModalOpen] = useState(false);

  // form state
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [tune, setTune] = useState("");
  const [titleMentions, setTitleMentions] = useState<Mention[]>([]);

  const busy = loading || saving;

  const canSave = useMemo(() => {
    return !!title.trim() && !!normalizeTonicity(tune).trim() && !saving;
  }, [title, tune, saving]);

  async function reload() {
    setErr(null);
    setAuthRequired(false);
    setLoading(true);

    const r = await fetchList(songId);

    if (!r.ok) {
      setRows([]);

      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία φόρτωσης");
      }

      setLoading(false);
      return;
    }

    setRows(r.data);
    setLoading(false);
  }

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (status === "unauthenticated") {
      setRows([]);
      setErr(null);
      setAuthRequired(true);
      setLoading(false);
      return;
    }

    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, status]);

  function resetForm() {
    setEditId(null);
    setTitle("");
    setTune("");
    setTitleMentions([]);
    setErr(null);
  }

  function openCreateModal() {
    resetForm();
    setModalOpen(true);
  }

  function openEditModal(r: SingerTuneRow) {
    setEditId(r.id);
    setTitle(r.title || "");
    setTune(normalizeTonicity(r.tune || ""));
    setTitleMentions([]);
    setErr(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    // δεν κάνουμε reset υποχρεωτικά, αλλά βοηθάει να μη μείνει "μισό"
    resetForm();
  }

  async function onDelete() {
    if (!editId) return;

    const ok = window.confirm("Διαγραφή αυτής της τονικότητας;");
    if (!ok) return;

    setErr(null);
    setSaving(true);

    const r = await deleteOne(songId, editId);

    if (!r.ok) {
      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία διαγραφής");
      }
      setSaving(false);
      return;
    }

    await reload();
    setSaving(false);
    closeModal();
  }

  async function onSave() {
    const cleanTitle = title.trim();
    const cleanTune = normalizeTonicity(tune).trim();

    if (!cleanTitle) return setErr("Ο τίτλος είναι υποχρεωτικός");
    if (!cleanTune) return setErr("Η τονικότητα είναι υποχρεωτική");

    setErr(null);
    setSaving(true);

    const r = await saveOne(songId, {
      ...(editId ? { id: editId } : {}),
      title: cleanTitle,
      tune: cleanTune,
    });

    if (!r.ok) {
      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία αποθήκευσης");
      }
      setSaving(false);
      return;
    }

    await reload();
    setSaving(false);
    closeModal();
  }

  const tunePicked = normalizeTonicity(tune);

  if (authRequired) {
    return (
      <>
        <ActionBar
          left={A.backLink({
            href: `/songs/${songId}`,
            title: "Πίσω στο τραγούδι",
            disabled: busy,
          })}
          right={null}
        />

        <h1 style={{ fontSize: 26, marginBottom: 12 }}>Τονικότητες</h1>

        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 12,
            maxWidth: 720,
            background: "rgba(0,0,0,0.03)",
          }}
        >
          Απαιτείται σύνδεση για προβολή και επεξεργασία τονικοτήτων.
        </div>
      </>
    );
  }

  return (
    <>
      <ActionBar
        left={A.backLink({
          href: `/songs/${songId}`,
          title: "Πίσω στο τραγούδι",
          disabled: busy,
        })}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {A.settingsLink({
              href: `/me/singer-tunes/settings?from=${encodeURIComponent(
                `/songs/${songId}/singer-tunes`
              )}`,
              disabled: busy,
              title: "Ρυθμίσεις",
              label: "Ρυθμίσεις",
            })}

            {A.add({
              onClick: openCreateModal,
              disabled: busy,
              title: "Νέο",
              label: "Νέο",
            })}
          </div>
        }
      />

      <h1 style={{ fontSize: 26, marginBottom: 12 }}>Τονικότητες</h1>

      {/* ✅ MODAL: εμφανίζεται μόνο όταν modalOpen */}
      <ModalShell
        open={modalOpen}
        title={editId ? "Επεξεργασία τονικότητας" : "Νέα τονικότητα"}
        onClose={closeModal}
        busy={saving}
        footer={
          <>

            {editId
              ? A.del({
                  onClick: onDelete,
                  disabled: saving,
                  title: "Διαγραφή",
                  label: "Διαγραφή",
                  style: { whiteSpace: "nowrap" },
                })
              : null}

            {A.save({
              disabled: saving || !canSave,
              loading: saving,
              onClick: onSave,
              title: editId ? "Ενημέρωση" : "Προσθήκη",
            })}
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
<div style={{ maxWidth: 720, width: "100%", minWidth: 0 }}>
<div style={{ marginBottom: 12, minWidth: 0 }}>
  <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
    Τίτλος
  </label>

  <UserMentionsField
    value={title}
    onChange={setTitle}
    mentions={titleMentions}
    onMentionsChange={setTitleMentions}
    placeholder="π.χ. @vas… Τραγουδιστής / Label"
    disabled={saving}
    multiline={false}
    minChars={3}
    take={8}
    showMentionLinks={true}
  />

  {/* ✅ ΜΟΝΟ αυτό: fix για overflow + rounded, χωρίς να κόβει dropdown */}
  <style jsx>{`
    :global(.user-mentions-field input),
    :global(.user-mentions-field textarea) {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;

      border-radius: 10px !important;
    }
  `}</style>
</div>




  <div style={{ marginBottom: 10 }}>
    <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
      Τονικότητα
    </label>

    <TonicityPills
      value={tunePicked}
      onChange={(v: TonicityValue) => setTune(v)}
      disabled={saving}
      withMinus={true}
      showNaturals={true}
      showSharps={true}
    />

    <div style={{ marginTop: 8, opacity: 0.85 }}>
      Επιλεγμένη: <strong>{tunePicked ? `${tunePicked}-` : "—"}</strong>
    </div>
  </div>

  <InlineError message={err ?? undefined} />
</div>

        </form>
      </ModalShell>

      <div style={{ marginTop: 12 }}>
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
                  <div style={{ opacity: 0.75 }}>
                    {(() => {
                      const t = normalizeTonicity(r.tune);
                      const looksGreek = /^[Α-Ωα-ω]+#?$/.test(t);
                      return looksGreek ? `${t}-` : t;
                    })()}
                  </div>
                </div>

                {A.edit({
                  onClick: () => openEditModal(r),
                  disabled: busy,
                  title: "Επεξεργασία",
                  label: "Επεξεργασία",
                  style: { whiteSpace: "nowrap" },
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function SingerTunesPageClient({
  songId,
  songTitle,
  songOriginalKey,
  songSign,
  initialRows,
}: {
  songId: number;
  songTitle: string;
  songOriginalKey: string | null;
  songSign: "+" | "-" | null;
  initialRows: SingerTuneRow[];
}) {
  return <SongSingerTunesEditorClient songId={songId} />;
}
