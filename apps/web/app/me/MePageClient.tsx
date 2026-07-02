"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  AlertTriangle,
  Check,
  Edit3,
  History,
  ListMusic,
  LogOut,
  Music2,
  Save,
  Settings2,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Button from "@/app/components/buttons/Button";
import { fetchJson } from "@/lib/api";

type UserRole =
  | "ADMIN"
  | "EDITOR"
  | "AUTHOR"
  | "CONTRIBUTOR"
  | "SUBSCRIBER"
  | "USER";

type RedirectDefault = "TITLE" | "CHORDS" | "LYRICS" | "SCORE";

type MeUser = {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  profile?: any | null;
};

type ProfilePrefs = {
  songTogglesDefault?: {
    chords?: boolean;
    tonicities?: boolean;
    info?: boolean;
    scores?: boolean;
  };
  songsRedirectDefault?: RedirectDefault;
};

function readPrefs(profile: any): Required<ProfilePrefs> {
  const prefs: ProfilePrefs =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? (profile.prefs ?? {})
      : {};

  return {
    songTogglesDefault: {
      chords: prefs.songTogglesDefault?.chords ?? true,
      tonicities: prefs.songTogglesDefault?.tonicities ?? true,
      info: prefs.songTogglesDefault?.info ?? true,
      scores: prefs.songTogglesDefault?.scores ?? false,
    },
    songsRedirectDefault: prefs.songsRedirectDefault ?? "TITLE",
  };
}

const pageStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
  color: "#fff",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.055)",
  padding: 16,
  minWidth: 0,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "#fff",
  color: "#111",
  outline: "none",
};

const mutedStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.68)",
  fontSize: 13,
};

function displayRole(role: UserRole) {
  const labels: Record<UserRole, string> = {
    ADMIN: "Διαχειριστής",
    EDITOR: "Editor",
    AUTHOR: "Author",
    CONTRIBUTOR: "Contributor",
    SUBSCRIBER: "Subscriber",
    USER: "Χρήστης",
  };
  return labels[role] || role;
}

function redirectLabel(value: RedirectDefault) {
  if (value === "CHORDS") return "Συγχορδίες";
  if (value === "LYRICS") return "Στίχοι";
  if (value === "SCORE") return "Παρτιτούρα";
  return "Τίτλος";
}

function initials(user: MeUser) {
  return (user.displayName || user.username || user.email || "U").slice(0, 1).toUpperCase();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <div style={mutedStyle}>{label}</div>
      <div style={{ fontWeight: 800, overflowWrap: "anywhere" }}>{value || "-"}</div>
    </div>
  );
}

function ToggleChip({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        border: active ? "1px solid #0d6efd" : "1px solid rgba(255,255,255,0.18)",
        background: active ? "#0d6efd" : "rgba(255,255,255,0.06)",
        color: "#fff",
        borderRadius: 999,
        padding: "8px 11px",
        fontWeight: 850,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.72 : 1,
      }}
    >
      {children}
    </button>
  );
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "#fff",
        textDecoration: "none",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 12,
        padding: "10px 12px",
        background: "rgba(255,255,255,0.045)",
        fontWeight: 850,
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export default function MePageClient({ user }: { user: MeUser }) {
  const prefs = useMemo(() => readPrefs(user.profile), [user.profile]);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [defChords, setDefChords] = useState(prefs.songTogglesDefault.chords ?? true);
  const [defTonicities, setDefTonicities] = useState(prefs.songTogglesDefault.tonicities ?? true);
  const [defInfo, setDefInfo] = useState(prefs.songTogglesDefault.info ?? true);
  const [defScores, setDefScores] = useState(prefs.songTogglesDefault.scores ?? false);
  const [redirectDefault, setRedirectDefault] = useState<RedirectDefault>(
    prefs.songsRedirectDefault ?? "TITLE",
  );
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const busy = saving || deactivating;
  const publicName = displayName.trim() || user.username || user.email || `User #${user.id}`;

  function resetForm() {
    setDisplayName(user.displayName ?? "");
    setDefChords(prefs.songTogglesDefault.chords ?? true);
    setDefTonicities(prefs.songTogglesDefault.tonicities ?? true);
    setDefInfo(prefs.songTogglesDefault.info ?? true);
    setDefScores(prefs.songTogglesDefault.scores ?? false);
    setRedirectDefault(prefs.songsRedirectDefault ?? "TITLE");
    setError(null);
    setOk(null);
  }

  function cancelEdit() {
    resetForm();
    setEditing(false);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setOk(null);

    try {
      await fetchJson(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim() ? displayName.trim() : null,
          profile: {
            prefs: {
              songTogglesDefault: {
                chords: defChords,
                tonicities: defTonicities,
                info: defInfo,
                scores: defScores,
              },
              songsRedirectDefault: redirectDefault,
            },
          },
        }),
      });

      setEditing(false);
      setOk("Οι αλλαγές αποθηκεύτηκαν.");
    } catch (err: any) {
      setError(err?.message || "Αποτυχία αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivateAccount() {
    const confirmed = window.confirm(
      "Θέλεις σίγουρα να απενεργοποιήσεις τον λογαριασμό σου; Θα αποσυνδεθείς και ο λογαριασμός δεν θα θεωρείται ενεργός.",
    );
    if (!confirmed) return;

    setDeactivating(true);
    setError(null);
    setOk(null);

    try {
      await fetchJson(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          profile: {
            account: {
              deactivatedAt: new Date().toISOString(),
            },
          },
        }),
      });

      await signOut({ callbackUrl: "/" });
    } catch (err: any) {
      setError(err?.message || "Αποτυχία απενεργοποίησης λογαριασμού.");
      setDeactivating(false);
    }
  }

  return (
    <div style={pageStyle}>
      <header
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          paddingBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              overflow: "hidden",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
              fontSize: 28,
              fontWeight: 950,
            }}
            title="Εικόνα προφίλ"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span>{initials(user)}</span>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>{publicName}</h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 999,
                  padding: "4px 8px",
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                <Shield size={13} />
                {displayRole(user.role)}
              </span>
            </div>
            <div style={{ ...mutedStyle, marginTop: 5 }}>
              Ο λογαριασμός σου και οι προσωπικές προεπιλογές στο Repertorio.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {editing ? (
            <>
              <Button type="button" variant="secondary" onClick={cancelEdit} disabled={busy}>
                <X size={16} /> Άκυρο
              </Button>
              <Button type="button" variant="primary" onClick={onSave} disabled={busy}>
                <Save size={16} /> {saving ? "Αποθήκευση..." : "Αποθήκευση"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" onClick={() => setEditing(true)} disabled={busy}>
              <Edit3 size={16} /> Επεξεργασία
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void signOut({ callbackUrl: "/" })}
            disabled={busy}
          >
            <LogOut size={16} /> Αποσύνδεση
          </Button>
        </div>
      </header>

      {error ? (
        <div style={{ color: "#ffb4b4", fontWeight: 800 }}>{error}</div>
      ) : ok ? (
        <div style={{ color: "#b8ffb8", fontWeight: 800 }}>{ok}</div>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
          gap: 14,
        }}
      >
        <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserRound size={19} />
            <h2 style={{ margin: 0, fontSize: 18 }}>Στοιχεία λογαριασμού</h2>
          </div>

          {editing ? (
            <div style={{ display: "grid", gap: 6 }}>
              <label style={mutedStyle}>Εμφανιζόμενο όνομα</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="π.χ. Βασίλης Αντωνίου"
                style={inputStyle}
              />
            </div>
          ) : (
            <Field label="Εμφανιζόμενο όνομα" value={user.displayName || "-"} />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Field label="Email" value={user.email || "-"} />
            <Field label="Username" value={user.username || "-"} />
            <Field label="Ρόλος" value={displayRole(user.role)} />
            <Field label="ID" value={`#${user.id}`} />
          </div>

          <div style={mutedStyle}>
            Η εικόνα προφίλ έρχεται από τον τρόπο σύνδεσης σου. Δεν εμφανίζεται πια ως απλό URL γιατί δεν είναι χρήσιμη καθημερινή ρύθμιση.
          </div>
        </div>

        <div style={{ ...cardStyle, display: "grid", gap: 10, alignContent: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Settings2 size={19} />
            <h2 style={{ margin: 0, fontSize: 18 }}>Γρήγορες επιλογές</h2>
          </div>
          <QuickLink href={`/songs?createdByUserId=${encodeURIComponent(String(user.id))}`} icon={<Music2 size={18} />} label="Τα τραγούδια μου" />
          <QuickLink href="/lists" icon={<ListMusic size={18} />} label="Οι λίστες μου" />
          <QuickLink href="/me/history" icon={<History size={18} />} label="Ιστορικό μου" />
          <QuickLink href="/me/singer-tunes/settings" icon={<Settings2 size={18} />} label="Ρυθμίσεις τονικοτήτων" />
        </div>
      </section>

      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Προεπιλογές τραγουδιών</h2>
            <div style={{ ...mutedStyle, marginTop: 4 }}>
              Ορίζουν τι ανοίγει προεπιλεγμένα όταν μπαίνεις σε τραγούδι.
            </div>
          </div>
          {!editing ? (
            <span style={{ ...mutedStyle, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Check size={15} /> Προβολή
            </span>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={mutedStyle}>Ενότητες που εμφανίζονται ανοικτές</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <ToggleChip active={defTonicities} disabled={!editing} onClick={() => setDefTonicities((v) => !v)}>Tunes</ToggleChip>
            <ToggleChip active={defInfo} disabled={!editing} onClick={() => setDefInfo((v) => !v)}>Info</ToggleChip>
            <ToggleChip active={defChords} disabled={!editing} onClick={() => setDefChords((v) => !v)}>Chords</ToggleChip>
            <ToggleChip active={defScores} disabled={!editing} onClick={() => setDefScores((v) => !v)}>Scores</ToggleChip>
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />

        <div style={{ display: "grid", gap: 8 }}>
          <div style={mutedStyle}>Πού να ανοίγει το τραγούδι</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["TITLE", "CHORDS", "LYRICS", "SCORE"] as RedirectDefault[]).map((value) => (
              <ToggleChip
                key={value}
                active={redirectDefault === value}
                disabled={!editing}
                onClick={() => setRedirectDefault(value)}
              >
                {redirectLabel(value)}
              </ToggleChip>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          ...cardStyle,
          borderColor: "rgba(255,120,120,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
          <AlertTriangle size={20} color="#ffb4b4" />
          <div>
            <div style={{ fontWeight: 950 }}>Απενεργοποίηση λογαριασμού</div>
            <div style={mutedStyle}>
              Ο λογαριασμός δεν διαγράφεται από τη βάση. Απενεργοποιείται και αποσυνδέεσαι από τη σελίδα.
            </div>
          </div>
        </div>
        <Button type="button" variant="danger" onClick={onDeactivateAccount} disabled={busy}>
          <Trash2 size={16} /> {deactivating ? "Απενεργοποίηση..." : "Απενεργοποίηση"}
        </Button>
      </section>
    </div>
  );
}
