"use client";

// apps/web/app/me/singer-tunes/settings/settings-client.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

type ApiUser = {
  id: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role?: string;
};

type AccessRow = {
  creatorUserId: number;
  canView: boolean;
  canEdit: boolean;
  creator: ApiUser;
};

type MyAccessResponse = {
  viewerUserId: number;
  mode: "ALL" | "ONLY_SELECTED";
  creatorUserIds: number[];
  rows: AccessRow[];
};

function uniq(arr: number[]) {
  return Array.from(new Set(arr));
}

function asName(u: ApiUser) {
  return u.displayName || u.username || `User #${u.id}`;
}

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

async function getJson<T>(url: string): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "include",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg =
      (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: body as T };
}

async function putJson<T>(url: string, payload: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    credentials: "include",
  });

  const body = await readJson(res);

  if (!res.ok) {
    const msg =
      (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: true, data: body as T };
}

export default function SingerTunesSettingsClient({
    backHref = "/songs",
  }: {
    backHref?: string;
  }) {
  const { status } = useSession();

  // ✅ Next Route Handler (server-side auth → internal API)
  const SETTINGS_URL = `/api/me/singer-tunes/access`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [authRequired, setAuthRequired] = useState(false);

  const [server, setServer] = useState<MyAccessResponse | null>(null);
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<number[]>([]);

  // search
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [results, setResults] = useState<ApiUser[]>([]);

  const busy = loading || saving || searching;

  const dirty = useMemo(() => {
    const a = uniq(server?.creatorUserIds || []).sort((x, y) => x - y);
    const b = uniq(selectedCreatorIds).sort((x, y) => x - y);
    return a.join(",") !== b.join(",");
  }, [server, selectedCreatorIds]);

  const selectedRows = useMemo(() => {
    const map = new Map<number, AccessRow>();
    for (const r of server?.rows || []) map.set(r.creatorUserId, r);

    return selectedCreatorIds
      .map((id) => map.get(id))
      .filter(Boolean) as AccessRow[];
  }, [server, selectedCreatorIds]);

  function addCreator(id: number) {
    setSelectedCreatorIds((prev) => uniq([...prev, id]));
  }

  function removeCreator(id: number) {
    setSelectedCreatorIds((prev) => prev.filter((x) => x !== id));
  }

  function resetToServer() {
    setSelectedCreatorIds(uniq(server?.creatorUserIds || []));
  }

  async function load() {
    setErr(null);
    setAuthRequired(false);
    setLoading(true);

    const r = await getJson<MyAccessResponse>(SETTINGS_URL);

    if (!r.ok) {
      setServer(null);
      setSelectedCreatorIds([]);

      if (r.status === 401) {
        setAuthRequired(true);
        setErr(null);
      } else {
        setErr(r.message || "Αποτυχία φόρτωσης");
      }

      setLoading(false);
      return;
    }

    setServer(r.data);
    setSelectedCreatorIds(uniq(r.data.creatorUserIds || []));
    setLoading(false);
  }

  async function save() {
    setErr(null);
    setAuthRequired(false);
    setSaving(true);

    const r = await putJson<MyAccessResponse>(SETTINGS_URL, {
      creatorUserIds: uniq(selectedCreatorIds),
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

    setServer(r.data);
    setSelectedCreatorIds(uniq(r.data.creatorUserIds || []));
    setSaving(false);
  }

  async function doSearch() {
    if (status !== "authenticated") {
      setSearchErr(null);
      setResults([]);
      setAuthRequired(true);
      return;
    }

    const query = q.trim();

    if (query.length < 3) {
      setSearchErr("Γράψε τουλάχιστον 3 χαρακτήρες για αναζήτηση.");
      setResults([]);
      return;
    }

    setSearchErr(null);
    setSearching(true);

    const r = await getJson<any>(
      `/api/users?q=${encodeURIComponent(query)}&take=12`
    );

    if (!r.ok) {
      if (r.status === 401) {
        setAuthRequired(true);
        setSearchErr(null);
        setResults([]);
      } else {
        setSearchErr(r.message || "Αποτυχία αναζήτησης");
        setResults([]);
      }
      setSearching(false);
      return;
    }

    const items = (r.data as any)?.items || [];
    const mapped: ApiUser[] = (items as any[])
      .map((u) => ({
        id: Number(u.id),
        username: u.username ?? null,
        displayName: u.displayName ?? u.name ?? null,
        avatarUrl: u.avatarUrl ?? null,
        role: u.role,
      }))
      .filter((u) => Number.isFinite(u.id) && u.id > 0);

    setResults(mapped);
    setSearching(false);
  }

  // initial load (gated by session)
  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (status === "unauthenticated") {
      setAuthRequired(true);
      setErr(null);
      setServer(null);
      setSelectedCreatorIds([]);
      setLoading(false);
      return;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // αν πέσει κάτω από 3 chars, καθαρίζουμε results/errors
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) {
      setResults([]);
      setSearchErr(null);
    }
  }, [q]);

  if (authRequired) {
    return (
      <>
        <ActionBar
          left={A.backLink({ href: backHref, title: "Πίσω" })}
          right={null}
        />

        <div style={{ maxWidth: 920 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
            Ρυθμίσεις Τονικοτήτων
          </div>

          <div
            style={{
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 12,
              padding: 12,
              background: "rgba(0,0,0,0.03)",
              maxWidth: 720,
            }}
          >
            Απαιτείται σύνδεση για να δεις ή να αλλάξεις αυτές τις ρυθμίσεις.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ActionBar
        left={A.backLink({ href: backHref, title: "Πίσω", disabled: busy })}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {A.save({
              disabled: busy || !dirty,
              loading: saving,
              onClick: save,
              title: "Αποθήκευση",
              label: "Αποθήκευση",
            })}

            {A.cancel({
              disabled: busy || !dirty,
              onClick: resetToServer,
              title: "Ακύρωση αλλαγών",
              label: "Ακύρωση",
            })}

            {A.refresh({
              disabled: busy,
              onClick: load,
              title: "Ανανέωση",
              label: "Ανανέωση",
            })}
          </div>
        }
      />

      <div style={{ maxWidth: 920 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
            Ποιων χρηστών τις τονικότητες να βλέπω
          </div>

          <div style={{ color: "rgba(0,0,0,0.65)", lineHeight: 1.35 }}>
            Αυτή η ρύθμιση είναι δική σου (viewer). Επιλέγεις creators και θα
            εμφανίζονται οι δικές τους τονικότητες. Το δικαίωμα{" "}
            <b>επεξεργασίας</b> (<code>canEdit</code>) το δίνει ο ίδιος ο
            creator.
          </div>

          <div style={{ marginTop: 8, fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
            Mode: <b>{server?.mode ?? "—"}</b>
          </div>

          <InlineError message={err ?? undefined} />
        </div>

        {/* Search */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Αναζήτηση χρηστών
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSearch();
              }}
              placeholder="Γράψε όνομα ή username (>= 3 χαρακτήρες)…"
              disabled={loading || saving}
              style={{
                flex: 1,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.18)",
                outline: "none",
              }}
            />

            {A.search({
              onClick: doSearch,
              disabled: loading || saving || q.trim().length < 3,
              title: "Αναζήτηση",
              label: "Αναζήτηση",
              style: { whiteSpace: "nowrap" },
            })}
          </div>

          <div style={{ marginTop: 10 }}>
            {searching ? (
              <div style={{ color: "rgba(0,0,0,0.6)" }}>Αναζήτηση…</div>
            ) : searchErr ? (
              <InlineError message={searchErr} />
            ) : results.length === 0 ? (
              q.trim().length >= 3 ? (
                <div style={{ color: "rgba(0,0,0,0.6)" }}>
                  Δεν βρέθηκαν χρήστες.
                </div>
              ) : (
                <div style={{ color: "rgba(0,0,0,0.6)" }}>
                  Γράψε τουλάχιστον 3 χαρακτήρες και πάτα Αναζήτηση.
                </div>
              )
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {results.map((u) => {
                  const isSelected = selectedCreatorIds.includes(u.id);

                  return (
                    <div
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "rgba(0,0,0,0.08)",
                          overflow: "hidden",
                          flex: "0 0 auto",
                        }}
                      >
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.avatarUrl}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : null}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {asName(u)}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
                          #{u.id}
                          {u.username ? ` · ${u.username}` : ""}
                          {u.role ? ` · ${u.role}` : ""}
                        </div>
                      </div>

                      {isSelected
                        ? A.cancel({
                            onClick: () => removeCreator(u.id),
                            disabled: loading || saving,
                            title: "Αφαίρεση",
                            label: "Αφαίρεση",
                            style: { whiteSpace: "nowrap" },
                          })
                        : A.add({
                            onClick: () => addCreator(u.id),
                            disabled: loading || saving,
                            title: "Προσθήκη",
                            label: "Προσθήκη",
                            style: { whiteSpace: "nowrap" },
                          })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Επιλεγμένοι χρήστες
          </div>

          {loading ? (
            <div style={{ opacity: 0.8 }}>Φόρτωση…</div>
          ) : selectedCreatorIds.length === 0 ? (
            <div style={{ color: "rgba(0,0,0,0.65)" }}>
              Δεν έχεις επιλέξει creators. Αν <b>αποθηκεύσεις</b> έτσι, θα
              ενεργοποιηθεί το mode “ALL” και θα εμφανίζονται οι singer tunes από
              όλους τους creators που έχεις δικαίωμα να βλέπεις.
            </div>
          ) : selectedRows.length === 0 ? (
            <div style={{ color: "rgba(0,0,0,0.65)" }}>
              Οι επιλογές σου θα εμφανιστούν εδώ μετά την αποθήκευση (και/ή όταν
              υπάρχουν rows από το backend).
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedRows.map((r) => (
                <div
                  key={r.creatorUserId}
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
                    <div style={{ fontWeight: 800 }}>{asName(r.creator)}</div>
                    <div style={{ opacity: 0.75 }}>
                      #{r.creator.id}
                      {r.creator.username ? ` · ${r.creator.username}` : ""}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    <span
                      title={
                        r.canEdit
                          ? "Έχεις δικαίωμα επεξεργασίας (ο creator στο έχει δώσει)"
                          : "Δεν έχεις δικαίωμα επεξεργασίας"
                      }
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(0,0,0,0.15)",
                        fontSize: 12,
                        fontWeight: 800,
                        background: r.canEdit
                          ? "rgba(0,0,0,0.06)"
                          : "transparent",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.canEdit ? "canEdit: ΝΑΙ" : "canEdit: ΟΧΙ"}
                    </span>

                    {A.cancel({
                      onClick: () => removeCreator(r.creatorUserId),
                      disabled: loading || saving,
                      title: "Αφαίρεση",
                      label: "Αφαίρεση",
                      style: { whiteSpace: "nowrap" },
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
          Σημείωση: Το “edit grant” θα γίνει <b>canEdit: ΝΑΙ</b> όταν ο creator
          (Α) σου το δώσει.
        </div>
      </div>
    </>
  );
}
