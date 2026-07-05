"use client";

import Link from "next/link";
import { Bell, CloudOff, ListMusic, Mic, Recycle, RefreshCw, Search } from "lucide-react";
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
import { useRooms } from "./RoomsProvider";

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
const PRESENCE_COUNTS_EVENT = "rep_presence_counts";
const ROOMS_UPDATE_COUNT_EVENT = "rep_rooms_update_count";
const ROOMS_API_BASE = "/rooms-api";
const OPEN_LOGIN_PROMPT_EVENT = "repertorio_open_login_prompt";
const GUEST_LOGIN_PROMPT_DISMISSED_UNTIL_KEY = "repertorio_guest_login_prompt_v3_dismissed_until";
const GUEST_LOGIN_PROMPT_DELAY_MS = 3500;
const GUEST_LOGIN_PROMPT_DISMISS_MS = 24 * 60 * 60 * 1000;
const LAST_VIEWED_LIST_KEY = "repertorio:lastViewedListId";
const LIST_PICKER_LAST_SELECTED_STORAGE_KEY = "repertorio_last_selected_list_id_v1";

type StatusRoomUser = {
  device_id?: string;
  user_id?: number;
  username?: string | null;
};

type StatusRoom = {
  room: string;
  userCount?: number;
  uniqueUsers?: number;
  sessions?: number;
  hasPassword: boolean;
  users?: StatusRoomUser[];
};

type StatusResponse = {
  ok: boolean;
  rooms?: StatusRoom[];
};

function roomPresenceCount(room: StatusRoom): number | null {
  if (typeof room.uniqueUsers === "number" && Number.isFinite(room.uniqueUsers)) {
    return room.uniqueUsers;
  }

  const users = Array.isArray(room.users) ? room.users : [];
  if (users.length > 0) {
    const unique = new Set<string>();
    users.forEach((user, index) => {
      if (typeof user.user_id === "number" && Number.isFinite(user.user_id)) {
        unique.add(`u:${user.user_id}`);
      } else if (user.device_id) {
        unique.add(`d:${user.device_id}`);
      } else {
        unique.add(`row:${index}`);
      }
    });
    return unique.size;
  }

  if (typeof room.userCount === "number" && Number.isFinite(room.userCount)) {
    return room.userCount;
  }

  return null;
}

function positiveRoomCount(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function localStoragePositiveInt(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function HeaderInner({ appVersion }: HeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isSongsPage = pathname === "/songs";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [guestLoginPromptOpen, setGuestLoginPromptOpen] = useState(false);
  const [guestLoginPromptCallbackUrl, setGuestLoginPromptCallbackUrl] = useState<string | null>(null);
  const [quickListNotice, setQuickListNotice] = useState<string | null>(null);

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
  const roomsRuntime = useRooms();

  const [currentRoomName, setCurrentRoomName] = useState<string | null>(null);
  const [roomUserCount, setRoomUserCount] = useState<number | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const providerRoomName = roomsRuntime.currentRoom;
  const effectiveCurrentRoomName = providerRoomName || currentRoomName;
  const providerRoomUserCount = positiveRoomCount(roomsRuntime.presence?.uniqueUsers);
  const displayedRoomUserCount = providerRoomUserCount ?? roomUserCount ?? (providerRoomName ? 1 : null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const quickListNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const openGuestLoginPrompt = useCallback((callbackUrl?: string | null) => {
    if (isLoggedIn) return;
    setGuestLoginPromptCallbackUrl(callbackUrl || null);
    setGuestLoginPromptOpen(true);
  }, [isLoggedIn]);

  const closeGuestLoginPrompt = useCallback((durationMs = GUEST_LOGIN_PROMPT_DISMISS_MS) => {
    setGuestLoginPromptOpen(false);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        GUEST_LOGIN_PROMPT_DISMISSED_UNTIL_KEY,
        String(Date.now() + durationMs),
      );
    } catch {
      // Best-effort UX memory only.
    }
  }, []);

  const handleGuestLoginPromptSignIn = useCallback(() => {
    setGuestLoginPromptOpen(false);
    const callbackUrl = guestLoginPromptCallbackUrl || getSameOriginCallbackUrl();
    void signIn("google", { callbackUrl });
  }, [getSameOriginCallbackUrl, guestLoginPromptCallbackUrl]);

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

  const openLastList = useCallback(() => {
    if (!isLoggedIn) {
      if (quickListNoticeTimerRef.current) {
        clearTimeout(quickListNoticeTimerRef.current);
        quickListNoticeTimerRef.current = null;
      }

      setQuickListNotice("Σύνδεση για τις λίστες");
      openGuestLoginPrompt("/lists");
      quickListNoticeTimerRef.current = setTimeout(() => {
        setQuickListNotice(null);
      }, 1800);
      return;
    }

    const listId =
      localStoragePositiveInt(LAST_VIEWED_LIST_KEY) ??
      localStoragePositiveInt(LIST_PICKER_LAST_SELECTED_STORAGE_KEY);

    if (quickListNoticeTimerRef.current) {
      clearTimeout(quickListNoticeTimerRef.current);
      quickListNoticeTimerRef.current = null;
    }

    setQuickListNotice(listId ? "Τελευταία λίστα" : "Δεν υπάρχει τελευταία λίστα");
    quickListNoticeTimerRef.current = setTimeout(() => {
      setQuickListNotice(null);
      router.push(listId ? `/lists/${listId}` : "/lists");
    }, 300);
  }, [isLoggedIn, openGuestLoginPrompt, router]);

  useEffect(() => {
    return () => {
      if (quickListNoticeTimerRef.current) clearTimeout(quickListNoticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const termFromUrl = searchParams.get("search_term") || "";
    setSearchValue(termFromUrl);
    setHasText(termFromUrl.trim().length > 0);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpenLoginPrompt = (event: Event) => {
      const detail = (event as CustomEvent<{ callbackUrl?: string | null }>).detail;
      openGuestLoginPrompt(detail?.callbackUrl || null);
    };
    window.addEventListener(OPEN_LOGIN_PROMPT_EVENT, onOpenLoginPrompt);
    return () => window.removeEventListener(OPEN_LOGIN_PROMPT_EVENT, onOpenLoginPrompt);
  }, [openGuestLoginPrompt]);

  useEffect(() => {
    if (isLoggedIn) {
      setGuestLoginPromptOpen(false);
      return;
    }
    if (typeof window === "undefined") return;

    try {
      const dismissedUntil = Number(window.localStorage.getItem(GUEST_LOGIN_PROMPT_DISMISSED_UNTIL_KEY) || "0");
      if (Number.isFinite(dismissedUntil) && dismissedUntil > Date.now()) return;
    } catch {
      // Storage is optional; fall through to a single delayed prompt.
    }

    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      setGuestLoginPromptOpen(true);
    }, GUEST_LOGIN_PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isLoggedIn, pathname]);

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
    setRoomUserCount(null);
    setRoomLoading(false);
  }, [effectiveCurrentRoomName]);

  useEffect(() => {
    if (!isLoggedIn || identity.isOfflineAuthenticated || !effectiveCurrentRoomName) {
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
          (r) => r.room && r.room.toLowerCase() === effectiveCurrentRoomName.toLowerCase(),
        );

        if (!match) {
          setRoomUserCount(null);
          return;
        }

        setRoomUserCount(positiveRoomCount(roomPresenceCount(match)));
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
  }, [isLoggedIn, identity.isOfflineAuthenticated, effectiveCurrentRoomName]);

  useEffect(() => {
    if (providerRoomUserCount != null) {
      setRoomUserCount(providerRoomUserCount);
      setRoomLoading(false);
    }
  }, [providerRoomUserCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLoggedIn || identity.isOfflineAuthenticated || !effectiveCurrentRoomName) return;

    const onPresence = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const eventRoom = String(detail.room || "").trim();
      if (!eventRoom || eventRoom.toLowerCase() !== effectiveCurrentRoomName.toLowerCase()) return;

      const count = positiveRoomCount(detail.uniqueUsers ?? detail.userCount ?? detail.onlineUsers);
      setRoomUserCount(count);
      setRoomLoading(false);
    };

    const onUpdateCount = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const eventRoom = String(detail.room || "").trim();
      if (!eventRoom || eventRoom.toLowerCase() !== effectiveCurrentRoomName.toLowerCase()) return;

      const count = positiveRoomCount(detail.uniqueUsers ?? detail.userCount);
      setRoomUserCount(count);
      setRoomLoading(false);
    };

    window.addEventListener(PRESENCE_COUNTS_EVENT, onPresence as EventListener);
    window.addEventListener(ROOMS_UPDATE_COUNT_EVENT, onUpdateCount as EventListener);
    return () => {
      window.removeEventListener(PRESENCE_COUNTS_EVENT, onPresence as EventListener);
      window.removeEventListener(ROOMS_UPDATE_COUNT_EVENT, onUpdateCount as EventListener);
    };
  }, [isLoggedIn, identity.isOfflineAuthenticated, effectiveCurrentRoomName]);

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

  const isInRoom = isLoggedIn && !identity.isOfflineAuthenticated && !!effectiveCurrentRoomName;

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
              <div style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}>
                <button
                  type="button"
                  className="header-categories-button"
                  title="Τελευταία λίστα"
                  aria-label="Άνοιγμα τελευταίας λίστας"
                  onClick={openLastList}
                  style={{ padding: 0, cursor: "pointer" }}
                >
                  <ListMusic size={21} strokeWidth={2.5} />
                </button>
                {quickListNotice ? (
                  <span
                    role="status"
                    aria-live="polite"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "calc(100% + 7px)",
                      zIndex: 30,
                      padding: "5px 8px",
                      borderRadius: 8,
                      background: "rgba(17, 17, 17, 0.94)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.16)",
                      boxShadow: "0 8px 22px rgba(0,0,0,0.28)",
                      fontSize: 12,
                      fontWeight: 800,
                      lineHeight: 1.15,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {quickListNotice}
                  </span>
                ) : null}
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
                  gap: offlineStatus.syncing ? 0 : 6,
                  color: offlineStatus.online ? "rgba(255,255,255,0.82)" : "#facc15",
                  fontWeight: 800,
                  fontSize: 12,
                  marginLeft: 8,
                  whiteSpace: "nowrap",
                }}
              >
                {offlineStatus.syncing ? <RefreshCw size={17} aria-hidden="true" /> : <CloudOff size={17} aria-hidden="true" />}
                {!offlineStatus.syncing ? <span>Offline</span> : null}
              </span>
            ) : null}

            <Link
              href="/rooms"
              className="rooms-button"
              title={effectiveCurrentRoomName ? `Rooms: ${effectiveCurrentRoomName}` : "Rooms"}
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

                {isInRoom && typeof displayedRoomUserCount === "number" ? (
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{displayedRoomUserCount}</span>
                ) : null}

                {isInRoom && displayedRoomUserCount == null && roomLoading ? (
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
                onClick={() => openGuestLoginPrompt(null)}
                title="Σύνδεση / Εγγραφή"
                style={{
                  width: "auto",
                  minWidth: 82,
                  height: 34,
                  borderRadius: 999,
                  background: "#0a84ff",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  border: "1px solid rgba(255,255,255,0.32)",
                  marginLeft: 8,
                  padding: "0 12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                }}
              >
                Σύνδεση
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

      {guestLoginPromptOpen && !isLoggedIn ? (
        <div
          role="presentation"
          onClick={() => closeGuestLoginPrompt()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2600,
            background: "rgba(0,0,0,0.52)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Πρόταση σύνδεσης"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(420px, 100%)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "#171717",
              color: "#fff",
              boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
              padding: 18,
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <strong style={{ fontSize: 18, lineHeight: 1.2 }}>Σύνδεση με Google</strong>
                <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 1.45 }}>
                  Συνδέσου για να κρατάς τις λίστες, τις τονικότητες, το ιστορικό και τις offline ρυθμίσεις σου σε κάθε συσκευή.
                </span>
              </div>
              <button
                type="button"
                onClick={() => closeGuestLoginPrompt()}
                aria-label="Κλείσιμο πρότασης σύνδεσης"
                title="Όχι τώρα"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  flex: "0 0 auto",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleGuestLoginPromptSignIn}
                style={{
                  minHeight: 40,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "#0a84ff",
                  color: "#fff",
                  padding: "0 14px",
                  fontWeight: 900,
                  cursor: "pointer",
                  flex: "1 1 170px",
                }}
              >
                Σύνδεση με Google
              </button>
              <button
                type="button"
                onClick={() => closeGuestLoginPrompt()}
                style={{
                  minHeight: 40,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  padding: "0 14px",
                  fontWeight: 800,
                  cursor: "pointer",
                  flex: "1 1 120px",
                }}
              >
                Όχι τώρα
              </button>
            </div>
            <small style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.35 }}>
              Μπορείς να συνεχίσεις κανονικά ως επισκέπτης.
            </small>
          </div>
        </div>
      ) : null}

      <SideMenu
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        pathname={pathname}
        isLoggedIn={isLoggedIn}
        onSignIn={doSignIn}
        onSignOut={doSignOut}
        userName={identity.userName}
        userEmail={userEmail}
        userId={identity.userId}
        avatarNode={avatarNode}
        offlineStatus={offlineStatus}
        offlineActionBusy={offlineActionBusy}
        onForceOfflineSync={handleForceOfflineSync}
        onSetOfflineSyncEnabled={handleSetOfflineSyncEnabled}
        onClearOfflineData={handleClearOfflineData}
        isInRoom={isInRoom}
        currentRoomName={effectiveCurrentRoomName}
        roomUserCount={displayedRoomUserCount}
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
