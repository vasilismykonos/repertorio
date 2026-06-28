"use client";

import Link from "next/link";
import { Bell, CloudOff, Mic, Recycle, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { signIn, signOut } from "next-auth/react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import SideMenu from "./SideMenu";
import {
  clearOfflineSyncedData,
  forceOfflineSync,
  setOfflineSyncEnabled,
  useOfflineRuntime,
} from "@/lib/offlineSync";
import { useOfflineIdentity } from "@/lib/useOfflineIdentity";
import { OPEN_NOTIFICATIONS_EVENT, useNotifications } from "@/app/hooks/useNotifications";

type HeaderProps = {
  appVersion?: string;
};

export default function Header(props: HeaderProps) {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";
  if (isEmbed) return null;
  return <HeaderInner appVersion={props.appVersion} />;
}

const STORAGE_KEY_ROOM = "repertorio_current_room";
const ROOM_CHANGED_EVENT = "repertorio_current_room_changed";
const ROOMS_API_BASE = "/rooms-api";

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

function HeaderInner({ appVersion }: HeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isSongsPage = pathname === "/songs";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const identity = useOfflineIdentity();
  const isLoggedIn = identity.isAuthenticated;
  const userEmail = identity.userEmail;
  const offlineStatus = useOfflineRuntime(isLoggedIn, userEmail);
  const [offlineActionBusy, setOfflineActionBusy] = useState(false);
  const notifications = useNotifications({
    enabled: isLoggedIn && !identity.isOfflineAuthenticated && offlineStatus.online !== false,
    take: 8,
    pollMs: 45_000,
    notifyOnNew: true,
  });

  const avatarUrl = identity.userImage || undefined;

  const [currentRoomName, setCurrentRoomName] = useState<string | null>(null);
  const [roomUserCount, setRoomUserCount] = useState<number | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [searchValue, setSearchValue] = useState("");
  const [hasText, setHasText] = useState(false);

  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const recognitionTimeoutRef = useRef<number | null>(null);

  const getSameOriginCallbackUrl = useCallback(() => {
    if (typeof window === "undefined") return "/";
    const path = window.location.pathname + window.location.search;
    return path || "/";
  }, []);

  const doSignIn = useCallback(() => {
    const callbackUrl = getSameOriginCallbackUrl();
    void signIn("google", { callbackUrl });
  }, [getSameOriginCallbackUrl]);

  const doSignOut = useCallback(() => {
    const callbackUrl = getSameOriginCallbackUrl();
    void signOut({ callbackUrl });
  }, [getSameOriginCallbackUrl]);

  const handleForceOfflineSync = useCallback(async () => {
    if (offlineActionBusy) return;
    setOfflineActionBusy(true);
    try {
      await forceOfflineSync(isLoggedIn, userEmail);
    } finally {
      setOfflineActionBusy(false);
    }
  }, [offlineActionBusy, isLoggedIn, userEmail]);

  const handleSetOfflineSyncEnabled = useCallback(async (enabled: boolean) => {
    await setOfflineSyncEnabled(enabled);
  }, []);

  const handleClearOfflineData = useCallback(async () => {
    if (offlineActionBusy || offlineStatus.syncing) return;
    const ok = window.confirm(
      "Να διαγραφούν τα offline δεδομένα συγχρονισμού από αυτή τη συσκευή; Η σύνδεση χρήστη θα παραμείνει αποθηκευμένη.",
    );
    if (!ok) return;

    setOfflineActionBusy(true);
    try {
      await clearOfflineSyncedData();
    } finally {
      setOfflineActionBusy(false);
    }
  }, [offlineActionBusy, offlineStatus.syncing]);

  const submitSearch = useCallback(
    (term: string) => {
      const params = new URLSearchParams(isSongsPage ? searchParams.toString() : "");

      if (term && term.trim() !== "") params.set("search_term", term.trim());
      else params.delete("search_term");

      params.set("skip", "0");
      if (!params.get("take")) params.set("take", "50");

      const qs = params.toString();
      router.push(qs ? `/songs?${qs}` : "/songs");
    },
    [isSongsPage, searchParams, router],
  );

  useEffect(() => {
    const termFromUrl = searchParams.get("search_term") || "";
    setSearchValue(termFromUrl);
    setHasText(termFromUrl.trim().length > 0);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readFromStorage = () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY_ROOM);
        if (stored && stored.trim() !== "") setCurrentRoomName(stored.trim());
        else setCurrentRoomName(null);
      } catch {
        setCurrentRoomName(null);
      }
    };

    readFromStorage();

    const handleStorageOrCustom = (event: StorageEvent | Event) => {
      if (event instanceof StorageEvent) {
        if (event.key === STORAGE_KEY_ROOM) readFromStorage();
        return;
      }
      if ((event as any).type === ROOM_CHANGED_EVENT) readFromStorage();
    };

    window.addEventListener("storage", handleStorageOrCustom as any);
    window.addEventListener(ROOM_CHANGED_EVENT, handleStorageOrCustom as any);

    return () => {
      window.removeEventListener("storage", handleStorageOrCustom as any);
      window.removeEventListener(ROOM_CHANGED_EVENT, handleStorageOrCustom as any);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn || identity.isOfflineAuthenticated || !currentRoomName) {
      setRoomUserCount(null);
      setRoomLoading(false);
      return;
    }

    let cancelled = false;

    const fetchCountFromStatus = async () => {
      try {
        setRoomLoading(true);

        const res = await fetch(`${ROOMS_API_BASE}/status`, { cache: "no-store" });
        if (!res.ok) throw new Error("Rooms status HTTP error");

        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;

        if (!data?.ok || !Array.isArray(data.rooms)) {
          setRoomUserCount(null);
          return;
        }

        const match = data.rooms.find(
          (r) => r.room && r.room.toLowerCase() === currentRoomName.toLowerCase(),
        );

        if (!match) {
          setRoomUserCount(0);
          return;
        }

        const usersArr = Array.isArray(match.users) ? match.users : [];
        const count =
          typeof match.userCount === "number" ? match.userCount : usersArr.length;

        setRoomUserCount(Number.isFinite(count) ? count : null);
      } catch {
        if (!cancelled) setRoomUserCount(null);
      } finally {
        if (!cancelled) setRoomLoading(false);
      }
    };

    fetchCountFromStatus();
    const id = window.setInterval(fetchCountFromStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isLoggedIn, identity.isOfflineAuthenticated, currentRoomName]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsVoiceSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "el-GR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognitionRef.current = recognition;
    setIsVoiceSupported(true);

    recognition.onresult = (event: any) => {
      if (recognitionTimeoutRef.current !== null) {
        window.clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }

      const transcript = event.results[0][0].transcript as string;

      setSearchValue(transcript);
      setHasText(transcript.trim().length > 0);

      if (searchInputRef.current) searchInputRef.current.value = transcript;

      window.setTimeout(() => submitSearch(transcript), 300);
    };

    const stopRecognition = () => {
      if (recognitionTimeoutRef.current !== null) {
        window.clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }
      recognition.stop();
    };

    recognition.onspeechend = stopRecognition;
    recognition.onerror = stopRecognition;

    return () => {
      if (recognitionTimeoutRef.current !== null) window.clearTimeout(recognitionTimeoutRef.current);
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, [submitSearch]);

  const handleVoiceSearchClick = () => {
    if (!recognitionRef.current) return;

    setSearchValue("");
    setHasText(false);
    if (searchInputRef.current) searchInputRef.current.value = "";

    recognitionRef.current.start();

    if (recognitionTimeoutRef.current !== null) window.clearTimeout(recognitionTimeoutRef.current);
    recognitionTimeoutRef.current = window.setTimeout(() => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    }, 5000);
  };

  const handleClearClick = () => {
    setSearchValue("");
    setHasText(false);
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
      searchInputRef.current.focus();
    }
  };

  const closeSidebar = () => setIsSidebarOpen(false);
  const overlayClass = isSidebarOpen ? "visible" : "";
  const openNotifications = () => {
    setIsSidebarOpen(true);
    void notifications.refresh();
    window.setTimeout(() => {
      window.dispatchEvent(new Event(OPEN_NOTIFICATIONS_EVENT));
    }, 0);
  };

  const avatarNode = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={identity.userName || identity.userEmail || "User avatar"}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        objectFit: "cover",
        display: "block",
      }}
    />
  ) : (
    <span
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        textAlign: "center",
        lineHeight: "32px",
      }}
    >
      👤
    </span>
  );

  const isInRoom = isLoggedIn && !identity.isOfflineAuthenticated && !!currentRoomName;

  return (
    <>
      <header className="site-header">
        <div className="header-container">
          <div className="header-logo">
            <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
              <img
                src="/images/default-logo.png"
                alt="Repertorio.net logo"
                style={{ maxWidth: 31, height: "auto", borderRadius: 8 }}
              />
              <span
                style={{
                  marginLeft: 10,
                  fontSize: "1.2em",
                  color: "#fff",
                  whiteSpace: "nowrap",
                }}
              >
                Repertorio.net
              </span>
            </Link>
          </div>

          <div className="header-search" style={{ width: "100%" }}>
            <div
              className="search-container"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <div className="menu-button-wrapper" style={{ display: "inline-block" }}>
                <Link href="/categories">
                  <button
                    type="button"
                    className="button"
                    title="Κατηγορίες"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "1.6em",
                      color: "#000",
                    }}
                  >
                    ☰
                  </button>
                </Link>
              </div>

              <form
                ref={formRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSearch(searchValue);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  maxWidth: 400,
                  width: "100%",
                  marginLeft: 8,
                }}
              >
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    ref={searchInputRef}
                    type="text"
                    id="searchInput"
                    name="search_term"
                    placeholder="Αναζήτηση τραγουδιού..."
                    value={searchValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchValue(val);
                      setHasText(val.trim().length > 0);
                    }}
                    style={{
                      width: "100%",
                      border: "1px solid #ccc",
                      borderRadius: 50,
                      padding: "8px 10px 8px 12px",
                      fontSize: 15,
                    }}
                    autoComplete="off"
                  />

                  <span
                    id="clearSearch"
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                      fontSize: 18,
                      color: "#888",
                      display: hasText ? "block" : "none",
                    }}
                    onClick={handleClearClick}
                  >
                    ×
                  </span>
                </div>

                {isVoiceSupported && (
                  <button
                    type="button"
                    id="voiceSearch"
                    className="button-style"
                    style={{ marginLeft: 5, border: "none", background: "none", cursor: "pointer" }}
                    onClick={handleVoiceSearchClick}
                    aria-label="Φωνητική αναζήτηση"
                    title="Φωνητική αναζήτηση"
                  >
                    <Mic size={18} aria-hidden="true" />
                  </button>
                )}

                <button
                  type="submit"
                  className="button-style search-button"
                  style={{ marginLeft: 5, border: "none", background: "none", cursor: "pointer" }}
                  aria-label="Αναζήτηση"
                  title="Αναζήτηση"
                >
                  <Search size={18} aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>

          <div className="header-buttons">
            {(!offlineStatus.online || offlineStatus.syncing) ? (
              <span
                title={
                  offlineStatus.syncing
                    ? "\u03a3\u03c5\u03b3\u03c7\u03c1\u03bf\u03bd\u03b9\u03c3\u03bc\u03cc\u03c2 offline δεδομένων"
                    : "Offline: χρήση αποθηκευμένων δεδομένων όπου υπάρχουν"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: offlineStatus.online ? "rgba(255,255,255,0.82)" : "#facc15",
                  fontWeight: 800,
                  fontSize: 12,
                  marginLeft: 8,
                  whiteSpace: "nowrap",
                }}
              >
                {offlineStatus.syncing ? <RefreshCw size={17} aria-hidden="true" /> : <CloudOff size={17} aria-hidden="true" />}
                <span>{offlineStatus.syncing ? "Sync" : "Offline"}</span>
              </span>
            ) : null}

            <Link
              href="/rooms"
              className="rooms-button"
              title={currentRoomName ? `Rooms: ${currentRoomName}` : "Rooms"}
            >
              <span
                className="rooms-icon"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: isInRoom ? "#7c3aed" : "rgba(255,255,255,0.55)",
                  fontWeight: 700,
                }}
              >
                <Recycle size={32} strokeWidth={2.6} />

                {isInRoom && typeof roomUserCount === "number" ? (
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{roomUserCount}</span>
                ) : null}

                {isInRoom && roomUserCount == null && roomLoading ? (
                  <span style={{ fontSize: 22, lineHeight: 1 }}>…</span>
                ) : null}
              </span>
            </Link>

            {notifications.unreadCount > 0 ? (
              <button
                type="button"
                className="header-notifications-button"
                onClick={openNotifications}
                title="Ενημερώσεις"
                aria-label={`Ενημερώσεις: ${notifications.unreadCount} αδιάβαστες`}
                style={{
                  marginLeft: 8,
                  minWidth: 42,
                  height: 34,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.34)",
                  background: "rgba(220,38,38,0.92)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  padding: "0 9px",
                  cursor: "pointer",
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                <Bell size={17} strokeWidth={2.6} aria-hidden="true" />
                <span style={{ fontSize: 14 }}>{notifications.unreadCount}</span>
              </button>
            ) : null}

            {isLoggedIn ? (
              <Link
                href="/me"
                title="Ο λογαριασμός μου"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "#aaa",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  border: "1px solid #fff",
                  marginLeft: 8,
                  padding: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  textDecoration: "none",
                }}
              >
                {avatarNode}
              </Link>
            ) : (
              <button
                type="button"
                onClick={doSignIn}
                title="Σύνδεση / Εγγραφή με Google"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "#aaa",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  border: "1px solid #fff",
                  marginLeft: 8,
                  padding: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                }}
              >
                👤
              </button>
            )}

            <button
              type="button"
              className="menu-toggle"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: "1px solid #fff",
                background: "transparent",
                color: "#fff",
                fontSize: 20,
                cursor: "pointer",
                marginLeft: 8,
              }}
              aria-label="Μενού"
              onClick={() => setIsSidebarOpen(true)}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <SideMenu
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        pathname={pathname}
        isLoggedIn={isLoggedIn}
        onSignIn={doSignIn}
        onSignOut={doSignOut}
        userName={identity.userName}
        userEmail={userEmail}
        avatarNode={avatarNode}
        offlineStatus={offlineStatus}
        offlineActionBusy={offlineActionBusy}
        onForceOfflineSync={handleForceOfflineSync}
        onSetOfflineSyncEnabled={handleSetOfflineSyncEnabled}
        onClearOfflineData={handleClearOfflineData}
        isInRoom={isInRoom}
        currentRoomName={currentRoomName}
        roomUserCount={roomUserCount}
        roomLoading={roomLoading}
        appVersion={appVersion}
        notificationsUnread={notifications.unreadCount}
        notifications={notifications.items}
        notificationsLoading={notifications.loading}
        notificationsError={notifications.error}
        pushSupported={notifications.pushSupported}
        pushPermission={notifications.pushPermission}
        pushSubscribed={notifications.pushSubscribed}
        pushBusy={notifications.pushBusy}
        pushError={notifications.pushError}
        onRefreshNotifications={notifications.refresh}
        onMarkNotificationsRead={notifications.markAllRead}
        onEnablePushNotifications={() => {
          void notifications.enablePushNotifications();
        }}
        onDisablePushNotifications={() => {
          void notifications.disablePushNotifications();
        }}
        onNewSong={() => {
          window.location.href = "/songs/new";
        }}
      />

      <div id="overlay" className={overlayClass} onClick={closeSidebar} />
    </>
  );
}
