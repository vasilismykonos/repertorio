"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Lock, Shuffle, UsersRound } from "lucide-react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";
import { useRooms } from "@/app/components/RoomsProvider";

const STORAGE_KEY_ROOM = "repertorio_current_room";
const STORAGE_KEY_ROOM_PWD = "repertorio_current_room_pwd";
const LEGACY_ROOM_STORAGE_KEY = "rep_current_room";
const ROOM_CHANGED_EVENT = "repertorio_current_room_changed";
const LEGACY_ROOM_CHANGED_EVENT = "rep_rooms_room_changed";

type CurrentUser = {
  id: number;
  email: string;
  role: string;
  username?: string | null;
  displayName?: string | null;
};

function cleanRoomName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function randomRoomName(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function saveCurrentRoom(room: string, password: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY_ROOM, room);
  window.localStorage.setItem(LEGACY_ROOM_STORAGE_KEY, room);
  if (password) window.localStorage.setItem(STORAGE_KEY_ROOM_PWD, password);
  else window.localStorage.removeItem(STORAGE_KEY_ROOM_PWD);

  for (const eventName of [ROOM_CHANGED_EVENT, LEGACY_ROOM_CHANGED_EVENT]) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: { room } }));
  }
}

export default function RoomsNewClient() {
  const router = useRouter();
  const { switchRoom } = useRooms();
  const [room, setRoom] = useState(() => randomRoomName());
  const [password, setPassword] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const res = await fetch("/api/current-user", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setCurrentUser(data?.user && typeof data.user === "object" ? data.user : null);
      } catch {
        if (!cancelled) setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const cleanRoom = useMemo(() => cleanRoomName(room), [room]);
  const canSubmit = !!currentUser && cleanRoom.length >= 2 && !saving;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ room: cleanRoom, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }

      switchRoom(cleanRoom, password);
      saveCurrentRoom(cleanRoom, password);
      router.push("/rooms");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Δεν δημιουργήθηκε το room.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ActionBar left={<A.backLink href="/rooms" label="Πίσω" />} />

      <main className="rooms-new">
        <section className="panel">
          <div className="title">
            <UsersRound size={28} />
            <div>
              <h1>Νέο room</h1>
              <p>Δημιούργησε ένα δωμάτιο και μπες αμέσως μέσα.</p>
            </div>
          </div>

          {authLoading ? (
            <div className="notice">Έλεγχος σύνδεσης...</div>
          ) : !currentUser ? (
            <div className="notice">
              <strong>Απαιτείται σύνδεση.</strong>
              <span>Για να δημιουργήσεις room πρέπει πρώτα να συνδεθείς.</span>
              <button type="button" onClick={() => signIn("google", { callbackUrl: "/rooms/new" })}>
                Σύνδεση
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="form">
              <label>
                <span>Όνομα room</span>
                <div className="input-row">
                  <input
                    value={room}
                    onChange={(event) => {
                      setRoom(event.target.value.slice(0, 40));
                      setError(null);
                    }}
                    autoFocus
                    required
                    minLength={2}
                    maxLength={40}
                    placeholder="π.χ. 123456"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => {
                      setRoom(randomRoomName());
                      setError(null);
                    }}
                    title="Τυχαίο όνομα"
                    aria-label="Τυχαίο όνομα room"
                  >
                    <Shuffle size={18} />
                  </button>
                </div>
              </label>

              <label>
                <span>
                  <Lock size={16} />
                  Κωδικός
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value.slice(0, 80))}
                  maxLength={80}
                  placeholder="Προαιρετικό"
                />
              </label>

              {error ? <div className="error">{error}</div> : null}

              <div className="actions">
                <button type="button" className="secondary" onClick={() => router.push("/rooms")} disabled={saving}>
                  Άκυρο
                </button>
                <button type="submit" className="primary" disabled={!canSubmit}>
                  {saving ? "Δημιουργία..." : "Δημιουργία room"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>

      <style jsx>{`
        .rooms-new {
          width: min(680px, calc(100vw - 28px));
          margin: 22px auto 56px;
          color: #fff;
        }
        .panel {
          border: 1px solid #2f2f2f;
          border-radius: 8px;
          background: #101010;
          padding: 18px;
        }
        .title {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 18px;
        }
        h1 {
          margin: 0;
          font-size: clamp(30px, 8vw, 44px);
          line-height: 1.05;
        }
        p {
          margin: 5px 0 0;
          color: #b8b8b8;
        }
        .form {
          display: grid;
          gap: 14px;
        }
        label {
          display: grid;
          gap: 7px;
          font-weight: 800;
        }
        label span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #3a3a3a;
          border-radius: 8px;
          background: #fff;
          color: #111;
          font: inherit;
          font-size: 18px;
          padding: 11px 12px;
        }
        .input-row {
          display: grid;
          grid-template-columns: 1fr 46px;
          gap: 8px;
          align-items: center;
        }
        .icon-btn,
        .primary,
        .secondary,
        .notice button {
          border-radius: 8px;
          border: 1px solid #333;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }
        .icon-btn {
          height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #202020;
          color: #fff;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .primary,
        .secondary,
        .notice button {
          min-height: 42px;
          padding: 0 16px;
        }
        .primary {
          background: #0b7cff;
          color: #fff;
          border-color: #0b7cff;
        }
        .primary:disabled,
        .secondary:disabled {
          opacity: 0.55;
          cursor: default;
        }
        .secondary {
          background: #191919;
          color: #fff;
        }
        .notice {
          display: grid;
          gap: 9px;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 13px;
          color: #ddd;
        }
        .notice button {
          justify-self: start;
          background: #fff;
          color: #111;
        }
        .error {
          border: 1px solid rgba(255, 80, 80, 0.45);
          background: rgba(255, 60, 60, 0.12);
          color: #ffd1d1;
          border-radius: 8px;
          padding: 10px 12px;
        }
      `}</style>
    </>
  );
}
