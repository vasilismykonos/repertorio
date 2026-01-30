"use client";

import React, { useMemo, useState } from "react";
import Button from "@/app/components/buttons/Button";
import { A } from "@/app/components/buttons/buttonActions";
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

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(255,255,255,0.85)",
};

const inputReadOnlyStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,          // ✅
  boxSizing: "border-box", // ✅
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  outline: "none",
};

const inputEditableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,            // ✅
  boxSizing: "border-box", // ✅
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "#ffffff",
  color: "#000000",
  outline: "none",
};

const cardStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 12,
  minWidth: 0,        // ✅
};


function AddressBar({
  title,
  right,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        flexWrap: "wrap",          // ✅
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 260px" }}> {/* ✅ */}
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#ffffff",
            overflow: "hidden",         // ✅
            textOverflow: "ellipsis",   // ✅
            whiteSpace: "nowrap",       // ✅
          }}
        >
          {title}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flex: "0 1 auto",
          minWidth: 0,             // ✅
          flexWrap: "wrap",        // ✅ (αν στριμώχνει σε mobile)
          justifyContent: "flex-end",
        }}
      >
        {right}
      </div>
    </div>
  );
}


export default function MePageClient({ user }: { user: MeUser }) {
  const prefs = useMemo(() => readPrefs(user.profile), [user.profile]);

  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");

  const [defChords, setDefChords] = useState<boolean>(
    prefs.songTogglesDefault.chords,
  );
  const [defTonicities, setDefTonicities] = useState<boolean>(
    prefs.songTogglesDefault.tonicities,
  );
  const [defInfo, setDefInfo] = useState<boolean>(prefs.songTogglesDefault.info);
  const [defScores, setDefScores] = useState<boolean>(prefs.songTogglesDefault.scores);

  const [redirectDefault, setRedirectDefault] = useState<RedirectDefault>(
    prefs.songsRedirectDefault,
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const avatarPreview = useMemo(() => {
    const v = String(avatarUrl ?? "").trim();
    return v ? v : null;
  }, [avatarUrl]);

  function onCancel() {
    // Reset to initial values
    setDisplayName(user.displayName ?? "");
    setAvatarUrl(user.avatarUrl ?? "");

    setDefChords(prefs.songTogglesDefault.chords);
    setDefTonicities(prefs.songTogglesDefault.tonicities);
    setDefInfo(prefs.songTogglesDefault.info);
    setDefScores(prefs.songTogglesDefault.scores);

    setRedirectDefault(prefs.songsRedirectDefault);

    setError(null);
    setOk(null);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setOk(null);

    try {
      const payload: {
        displayName?: string | null;
        avatarUrl?: string | null;
        profile?: any | null;
      } = {
        displayName: displayName.trim() ? displayName.trim() : null,
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
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
      };

      await fetchJson(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setOk("Αποθηκεύτηκε.");
    } catch (e: any) {
      setError(e?.message || "Αποτυχία αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, color: "#ffffff" }}>
      {/* ✅ AddressBar (actions εδώ, όχι κάτω) */}
      <AddressBar
        title="Ο λογαριασμός μου"
        right={
            <>
            

            {A.cancel({
                onClick: onCancel,
                disabled: saving,
            })}

            {A.save({
                onClick: onSave,
                disabled: saving,
                loading: saving,
            })}
            {A.logout({
                title: "Αποσύνδεση",
                callbackUrl: "/",   // εδώ θες home μετά το logout
                variant: "danger",
            })}
            
            </>
        }
        />


      <div style={cardStyle}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              overflow: "hidden",
              background: "rgba(255,255,255,0.08)",
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
              color: "#ffffff",
            }}
            title="Avatar"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarPreview}
                alt="avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span>
                {(user.displayName || user.username || user.email || "U")
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>
              {user.displayName || user.username || user.email || `User #${user.id}`}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
              Ρόλος: <b style={{ color: "#ffffff" }}>{user.role}</b>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Email</label>
          <input value={user.email ?? ""} readOnly style={inputReadOnlyStyle} />
        </div>

        
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Εμφανιζόμενο όνομα</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="π.χ. Βασίλης Αντωνίου"
            style={inputEditableStyle}
          />
        </div>

        
      </div>

      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 16, color: "#ffffff" }}>
          Προεπιλογές τραγουδιών
        </h2>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            Επιλέξτε την προεπιλεγμένη κατάσταση των επιλογών στα τραγούδια
          </div>

          <div
            className="song-toggles"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 4,
            }}
          >
            <Button
              type="button"
              variant={defTonicities ? "primary" : "secondary"}
              onClick={() => setDefTonicities((v) => !v)}
              title={
                defTonicities
                  ? "Προεπιλογή: ανοικτές Τονικότητες"
                  : "Προεπιλογή: κλειστές Τονικότητες"
              }
              aria-pressed={defTonicities}
            >
              Tunes
            </Button>

            <Button
              type="button"
              variant={defInfo ? "primary" : "secondary"}
              onClick={() => setDefInfo((v) => !v)}
              title={
                defInfo
                  ? "Προεπιλογή: ανοικτές Πληροφορίες"
                  : "Προεπιλογή: κλειστές Πληροφορίες"
              }
              aria-pressed={defInfo}
            >
              Info
            </Button>

            <Button
              type="button"
              variant={defChords ? "primary" : "secondary"}
              onClick={() => setDefChords((v) => !v)}
              title={
                defChords
                  ? "Προεπιλογή: ανοικτές Συγχορδίες"
                  : "Προεπιλογή: κλειστές Συγχορδίες"
              }
              aria-pressed={defChords}
            >
              Chords
            </Button>

            <Button
              type="button"
              variant={defScores ? "primary" : "secondary"}
              onClick={() => setDefScores((v) => !v)}
              title={
                defScores
                  ? "Προεπιλογή: ανοικτές Παρτιτούρες"
                  : "Προεπιλογή: κλειστές Παρτιτούρες"
              }
              aria-pressed={defScores}
            >
              Scores
            </Button>
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.12)" }} />

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            Προεπιλογή ανακατεύθυνσης
          </div>

          <div
            className="song-toggles"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <Button
              type="button"
              variant={redirectDefault === "TITLE" ? "primary" : "secondary"}
              onClick={() => setRedirectDefault("TITLE")}
              title="Άνοιγμα στο επάνω μέρος (Τίτλος)"
              aria-pressed={redirectDefault === "TITLE"}
            >
              Τίτλος
            </Button>

            <Button
              type="button"
              variant={redirectDefault === "CHORDS" ? "primary" : "secondary"}
              onClick={() => setRedirectDefault("CHORDS")}
              title="Άνοιγμα στις Συγχορδίες"
              aria-pressed={redirectDefault === "CHORDS"}
            >
              Συγχορδίες
            </Button>

            <Button
              type="button"
              variant={redirectDefault === "LYRICS" ? "primary" : "secondary"}
              onClick={() => setRedirectDefault("LYRICS")}
              title="Άνοιγμα στους Στίχους"
              aria-pressed={redirectDefault === "LYRICS"}
            >
              Στίχοι
            </Button>

            <Button
              type="button"
              variant={redirectDefault === "SCORE" ? "primary" : "secondary"}
              onClick={() => setRedirectDefault("SCORE")}
              title="Άνοιγμα στην Παρτιτούρα"
              aria-pressed={redirectDefault === "SCORE"}
            >
              Παρτιτούρα
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ color: "#ffb4b4" }}>{error}</div>
      ) : ok ? (
        <div style={{ color: "#b8ffb8" }}>{ok}</div>
      ) : null}
    </div>
  );
}
