// apps/web/app/components/SideMenu.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Recycle,
  Music2,
  ListMusic,
  Users,
  Settings,
  User,
  Mic2,
  Download,
  Mail,
  PlusSquare,
  LogIn,
  LogOut,
} from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;

  pathname: string;

  // auth
  isLoggedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;

  // user
  userName?: string | null;
  userEmail?: string | null;
  avatarNode: React.ReactNode;

  // room
  isInRoom: boolean;
  currentRoomName: string | null;
  roomUserCount: number | null;
  roomLoading: boolean;
  // build info
  appVersion?: string;
  gitSha?: string | null;
  /**
   * Προαιρετικό: αν το περνάς από πάνω (Header) fine.
   * Αν όχι, το SideMenu θα το υπολογίσει μόνο του από το API με βάση email.
   */
  isAdmin?: boolean;

  // actions
  onNewSong: () => void;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ✅ MUST MATCH Header.tsx / RoomsClient.tsx
const STORAGE_KEY_ROOM = "repertorio_current_room";
const ROOM_CHANGED_EVENT = "repertorio_current_room_changed";
const ROOMS_API_BASE = "/rooms-api";

// ✅ Your Nest global prefix
const API_BASE = "/api/v1";

type StatusRoomUser = {
  device_id?: string;
  user_id?: number;
  username?: string | null;
};

type StatusRoom = {
  room: string;
  userCount?: number;
  hasPassword: boolean;
  users?: StatusRoomUser[];
};

type StatusResponse = {
  ok: boolean;
  rooms?: StatusRoom[];
};

// ---- Users API response (as in currentUser.ts) ----
type UserListItem = {
  id: number;
  email: string | null;
  role: string | null;
};

type UsersResponse = {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function SideMenu(props: Props) {
  const {
    isOpen,
    onClose,
    pathname,
    isLoggedIn,
    onSignIn,
    onSignOut,
    userName,
    userEmail,
    avatarNode,
    onNewSong,
    isAdmin: isAdminProp,
    appVersion,
    gitSha,
  } = props;

  const sidebarClass = `site-sidebar${isOpen ? " visible" : ""}`;
  const overlayClass = isOpen ? "visible" : "";

  const displayName = userName || userEmail || "Επισκέπτης";
  const statusText = isLoggedIn ? "Συνδεδεμένος" : "Επισκέπτης";

  

  // =========================
  // ✅ LIVE room state (no refresh)
  // =========================
  const [currentRoomNameLocal, setCurrentRoomNameLocal] = useState<string | null>(null);
  const [roomUserCountLocal, setRoomUserCountLocal] = useState<number | null>(null);
  const [roomLoadingLocal, setRoomLoadingLocal] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const readRoom = () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY_ROOM);
        const name = stored && stored.trim() !== "" ? stored.trim() : null;
        setCurrentRoomNameLocal(name);
      } catch {
        setCurrentRoomNameLocal(null);
      }
    };

    readRoom();

    const onStorageOrCustom = (event: StorageEvent | Event) => {
      if (event instanceof StorageEvent) {
        if (event.key === STORAGE_KEY_ROOM) readRoom();
        return;
      }
      if ((event as any).type === ROOM_CHANGED_EVENT) readRoom();
    };

    window.addEventListener("storage", onStorageOrCustom as any);
    window.addEventListener(ROOM_CHANGED_EVENT, onStorageOrCustom as any);

    // same-tab fallback polling only while open
    let pollId: number | null = null;
    if (isOpen) pollId = window.setInterval(readRoom, 700);

    return () => {
      window.removeEventListener("storage", onStorageOrCustom as any);
      window.removeEventListener(ROOM_CHANGED_EVENT, onStorageOrCustom as any);
      if (pollId != null) window.clearInterval(pollId);
    };
  }, [isOpen]);

  const isInRoomLocal = isLoggedIn && !!currentRoomNameLocal;

  useEffect(() => {
    if (!isLoggedIn || !currentRoomNameLocal) {
      setRoomUserCountLocal(null);
      setRoomLoadingLocal(false);
      return;
    }

    let cancelled = false;

    const fetchCount = async () => {
      try {
        setRoomLoadingLocal(true);

        const res = await fetch(`${ROOMS_API_BASE}/status`, { cache: "no-store" });
        if (!res.ok) throw new Error("Rooms status HTTP error");

        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;

        if (!data?.ok || !Array.isArray(data.rooms)) {
          setRoomUserCountLocal(null);
          return;
        }

        const match = data.rooms.find(
          (r) => r.room && r.room.toLowerCase() === currentRoomNameLocal.toLowerCase(),
        );

        if (!match) {
          setRoomUserCountLocal(0);
          return;
        }

        const usersArr = Array.isArray(match.users) ? match.users : [];
        const count = typeof match.userCount === "number" ? match.userCount : usersArr.length;
        setRoomUserCountLocal(Number.isFinite(count) ? count : null);
      } catch {
        if (!cancelled) setRoomUserCountLocal(null);
      } finally {
        if (!cancelled) setRoomLoadingLocal(false);
      }
    };

    fetchCount();
    const id = window.setInterval(fetchCount, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isLoggedIn, currentRoomNameLocal]);
    // =========================
  useEffect(() => {
  if (typeof window === "undefined") return;
  if (!isOpen) return;

  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail || {};
    const n = typeof d.uniqueUsers === "number" ? d.uniqueUsers : null;
    setOnlineCount(n);
  };

  window.addEventListener("rep_presence_counts", handler as any);

  return () => window.removeEventListener("rep_presence_counts", handler as any);
}, [isOpen]);

  // =========================
  // ✅ Admin detection (client-side) based on your currentUser.ts logic
  // =========================
  const [isAdminResolved, setIsAdminResolved] = useState<boolean>(false);
  const [adminResolved, setAdminResolved] = useState<boolean>(false); // "we tried"

  useEffect(() => {
    // Αν το δίνει parent, δεν χρειάζεται resolve.
    if (typeof isAdminProp === "boolean") {
      setIsAdminResolved(isAdminProp);
      setAdminResolved(true);
      return;
    }

    // Αν δεν είμαστε logged in ή δεν έχουμε email, δεν υπάρχει admin.
    const email = (userEmail || "").trim();
    if (!isLoggedIn || !email) {
      setIsAdminResolved(false);
      setAdminResolved(true);
      return;
    }

    // Μην βαράς API όταν το menu είναι κλειστό (optional optimization)
    if (!isOpen) return;

    const ctrl = new AbortController();

    const run = async () => {
      try {
        const search = encodeURIComponent(email);
        const url = `${API_BASE}/users?search=${search}&page=1&pageSize=5`;

        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) throw new Error("Users HTTP error");

        const data = (await res.json()) as UsersResponse;
        const lower = email.toLowerCase();

        const match = Array.isArray(data?.items)
          ? data.items.find((u) => (u.email ?? "").toLowerCase() === lower)
          : null;

        const role = String(match?.role ?? "USER").toUpperCase();
        setIsAdminResolved(role === "ADMIN");
      } catch {
        // Σε σφάλμα, default: όχι admin
        setIsAdminResolved(false);
      } finally {
        setAdminResolved(true);
      }
    };

    run();

    return () => ctrl.abort();
  }, [isAdminProp, isLoggedIn, userEmail, isOpen]);

  const effectiveIsAdmin = typeof isAdminProp === "boolean" ? isAdminProp : isAdminResolved;

  // =========================
  // Tiles
  // =========================
  type Tile = {
    key: string;
    href?: string;
    onClick?: () => void;
    label: string;
    Icon: React.ComponentType<any>;
    badge?: string | number | null;
    kind?: "primary" | "normal";
    id?: string;
    as?: "link" | "a" | "button";
    aHref?: string;
  };

  const tiles: Tile[] = useMemo(() => {
    const roomBadge =
      isInRoomLocal && typeof roomUserCountLocal === "number"
        ? roomUserCountLocal
        : isInRoomLocal && roomLoadingLocal
          ? "…"
          : null;

    const list: Tile[] = [
      {
        key: "new",
        label: "Νέο τραγούδι",
        Icon: PlusSquare,
        as: "button",
        kind: "primary",
        onClick: () => {
          onClose();
          onNewSong();
        },
      },
      { key: "songs", href: "/songs", label: "Τραγούδια", Icon: Music2, as: "link" },
      { key: "lists", href: "/lists", label: "Λίστες", Icon: ListMusic, as: "link" },
      { key: "artists", href: "/artists", label: "Καλλιτέχνες", Icon: Mic2, as: "link" },
      { key: "rooms", href: "/rooms", label: "Rooms", Icon: Recycle, as: "link", badge: roomBadge },
      { key: "me", href: "/me", label: "Λογαριασμός", Icon: User, as: "link" },
      { key: "users", href: "/users", label: "Χρήστες", Icon: Users, as: "link" },

      ...(effectiveIsAdmin
        ? [{ key: "settings", href: "/settings", label: "Admin", Icon: Settings, as: "link" as const }]
        : []),

      {
        key: "install",
        label: "Εγκατάσταση",
        Icon: Download,
        as: "a",
        id: "installAppLink",
        aHref: "#",
        onClick: () => onClose(),
      },
      {
        key: "contact",
        label: "Επικοινωνία",
        Icon: Mail,
        as: "a",
        aHref: "mailto:repertorio.net@gmail.com",
        onClick: () => onClose(),
      },
    ];

    return list;
  }, [
    pathname,
    isInRoomLocal,
    roomUserCountLocal,
    roomLoadingLocal,
    onClose,
    onNewSong,
    effectiveIsAdmin,
  ]);

  return (
    <>
      <aside id="sidebar" className={sidebarClass} aria-hidden={!isOpen}>
        {/* Top user card */}
        <div className="smh-top">
          <div className="smh-user">
            <span className="smh-avatar">{avatarNode}</span>
            <div className="smh-meta">
              <div className="smh-name" title={displayName}>
                {displayName}
              </div>

              <div className="smh-sub">
                <span className={cx("smh-dot", isLoggedIn && "on")} />
                {statusText}

                {isInRoomLocal && currentRoomNameLocal ? (
                  <span className="smh-room">
                    <Recycle size={14} strokeWidth={2.6} />
                    <span className="smh-room-name" title={currentRoomNameLocal}>
                      {currentRoomNameLocal}
                    </span>
                  </span>
                ) : null}

                {/* Προαιρετικό debug indicator (σβήσε το αν δεν το θες) */}
                {isLoggedIn && !adminResolved ? <span style={{ opacity: 0.6 }}>role…</span> : null}
              </div>
            </div>
          </div>

          <button
            id="closeSidebar"
            onClick={onClose}
            className="smh-close"
            aria-label="Κλείσιμο"
            title="Κλείσιμο"
          >
            ×
          </button>
        </div>

        {/* Auth row */}
        <div className="smh-auth">
          <button
            type="button"
            className="smh-auth-btn"
            onClick={() => {
              onClose();
              isLoggedIn ? onSignOut() : onSignIn();
            }}
            title={isLoggedIn ? "Αποσύνδεση" : "Σύνδεση"}
          >
            {isLoggedIn ? <LogOut size={18} /> : <LogIn size={18} />}
            <span>{isLoggedIn ? "Αποσύνδεση" : "Σύνδεση"}</span>
          </button>
        </div>

        <div className="smh-sep" />

        {/* Android-like tiles */}
        <nav className="smh-grid" aria-label="Μενού">
          {tiles.map((t) => {
            const Icon = t.Icon;

            const tileInner = (
              <>
                <span className={cx("smh-ico", t.kind === "primary" && "primary")}>
                  <Icon className="smh-ico-icon" strokeWidth={2.4} />
                  {t.badge != null ? <span className="smh-badge">{t.badge}</span> : null}
                </span>

                <span className="smh-label">{t.label}</span>
              </>
            );

            if (t.as === "button") {
              return (
                <button
                  key={t.key}
                  type="button"
                  className={cx("smh-tile", t.kind === "primary" && "primary")}
                  onClick={t.onClick}
                >
                  {tileInner}
                </button>
              );
            }

            if (t.as === "a") {
              return (
                <a
                  key={t.key}
                  id={t.id}
                  href={t.aHref || "#"}
                  className={cx("smh-tile", t.kind === "primary" && "primary")}
                  onClick={() => t.onClick?.()}
                >
                  {tileInner}
                </a>
              );
            }

            return (
              <Link
                key={t.key}
                href={t.href!}
                className={cx("smh-tile", t.kind === "primary" && "primary")}
                onClick={onClose}
              >
                {tileInner}
              </Link>
            );
          })}
        </nav>

        
         <div className="smh-footer">
            <div className="smh-footer-links">
                Πηγές;
                <a href="https://notttes.blogspot.com/" onClick={onClose}>
                Παρτιτούρες (Παίξε μπουζούκι, παίξε...)
                </a>
                <a href="https://rebetiko.sealabs.net/" onClick={onClose}>
                Πληροφορίες (sealabs)
                </a>
            </div>

            <div className="smh-footer-meta">
                <span>
                    Έκδοση: {appVersion ?? "—"}
                    {gitSha ? ` • ${gitSha}` : ""}
                </span>
                <span style={{ marginLeft: 10 }}>
                    Χρήστες online: {onlineCount ?? "—"}
                </span>
            </div>
        </div>
        
        <style jsx global>{`
        /* =========================================================
            Sidebar: scrollable + top-most layer
        ========================================================= */
        #sidebar.site-sidebar {
            /* ✅ κράτα ΜΟΝΙΜΑ το “mobile” drawer width */
            width: 340px !important;
            max-width: 340px !important;

            /* ✅ να μην αλλάζει στο desktop από global rules */
            box-sizing: border-box;

            padding: 14px !important;

            max-height: 100vh !important;
            max-height: 100dvh !important;

            overflow-y: auto !important;
            overflow-x: hidden !important;

            -webkit-overflow-scrolling: touch;

            z-index: 2147483647 !important;
            }

        /* =========================================================
            Top user card
        ========================================================= */
        .smh-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-top: 6px;
        }

        .smh-user {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        .smh-avatar {
            width: 46px;
            height: 46px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.22);
            overflow: hidden;
            background: rgba(255, 255, 255, 0.06);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
        }

        .smh-meta {
            min-width: 0;
        }

        .smh-name {
            color: #fff;
            font-weight: 900;
            font-size: 15px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 220px;
        }

        .smh-sub {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 2px;
            color: rgba(255, 255, 255, 0.65);
            font-size: 12px;
            min-width: 0;
            flex-wrap: wrap;
        }

        .smh-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.25);
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
        }
        .smh-dot.on {
            background: rgba(34, 197, 94, 0.95);
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
        }

        .smh-room {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 2px 8px;
            border-radius: 999px;
            border: 1px solid rgba(124, 58, 237, 0.35);
            background: rgba(124, 58, 237, 0.12);
            color: rgba(255, 255, 255, 0.92);
            min-width: 0;
        }

        .smh-room-name {
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .smh-close {
            width: 40px;
            height: 40px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.06);
            color: #fff;
            font-size: 24px;
            cursor: pointer;
            flex: 0 0 auto;
        }
        .smh-close:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        /* =========================================================
            Auth row
        ========================================================= */
        .smh-auth {
            margin-top: 12px;
        }

        .smh-auth-btn {
            width: 100%;
            height: 42px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.06);
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            cursor: pointer;
            font-weight: 900;
            font-size: 14px;
        }
        .smh-auth-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .smh-sep {
            height: 1px;
            background: rgba(255, 255, 255, 0.12);
            margin: 14px 0;
            width: 100%;
        }

        /* =========================================================
            Tiles grid
        ========================================================= */
        .smh-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px 10px;
            padding: 2px 2px 0;
        }

        .smh-tile {
            text-decoration: none;
            color: rgba(255, 255, 255, 0.92);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 10px 6px;
            border-radius: 16px;
            border: 1px solid transparent;
            background: transparent;
            cursor: pointer;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        .smh-tile:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .smh-ico {
            width: 56px;
            height: 56px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.12);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            position: relative;
            color: #fff;
        }

        .smh-ico-icon {
            width: 22px;
            height: 22px;
        }

        .smh-badge {
            position: absolute;
            top: -8px;
            right: -8px;
            min-width: 22px;
            height: 22px;
            padding: 0 6px;
            border-radius: 999px;
            background: rgb(124, 58, 237);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.18);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
            font-size: 12px;
            line-height: 1;
        }

        /* ✅ Always 1-line labels with ellipsis */
        .smh-label {
            font-weight: 900;
            font-size: 12px;
            text-align: center;
            line-height: 1.15;
            color: rgba(255, 255, 255, 0.88);

            display: block;
            width: 100%;
            max-width: 100%;

            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* =========================================================
            Footer
        ========================================================= */
        .smh-footer {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
        }

        .smh-footer-links {
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 12px;
        }

        .smh-footer-links a {
            color: rgba(255, 255, 255, 0.82);
            text-decoration: none;
        }

        .smh-footer-links a:hover {
            text-decoration: underline;
        }

        .smh-footer-meta {
            margin-top: 10px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.55);

            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        /* =========================================================
            Small screens
        ========================================================= */
        @media (max-width: 420px) {
            .smh-ico {
            width: 50px;
            height: 50px;
            border-radius: 16px;
            }
            .smh-ico-icon {
            width: 20px;
            height: 20px;
            }
            .smh-label {
            font-size: 11.5px;
            }
        }

        /* =========================================================
            Desktop: slightly more compact
        ========================================================= */
        @media (min-width: 768px) {
            .smh-grid {
            gap: 10px 8px;
            }
            .smh-tile {
            padding: 8px 6px;
            }
            .smh-ico {
            width: 50px;
            height: 50px;
            border-radius: 16px;
            }
            .smh-ico-icon {
            width: 20px;
            height: 20px;
            }
            .smh-label {
            font-size: 11px;
            }
        }
        `}</style>
      </aside>

      <div id="overlay" className={overlayClass} onClick={onClose} />
    </>
  );
}
