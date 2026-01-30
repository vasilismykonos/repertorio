// apps/web/app/components/Header.tsx
"use client";

import Link from "next/link";
import { Recycle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

// Wrapper: κρύβει εντελώς το header όταν έχουμε ?embed=1
export default function Header() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";
  if (isEmbed) return null;
  return <HeaderInner />;
}

// ✅ MUST MATCH RoomsClient.tsx
const STORAGE_KEY_ROOM = "repertorio_current_room";
const ROOM_CHANGED_EVENT = "repertorio_current_room_changed";

// ✅ Rooms page χρησιμοποιεί /rooms-api (proxy από nginx προς rooms server)
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

function HeaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isSongsPage = pathname === "/songs";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ---- NextAuth session ----
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";

  const avatarUrl =
    (session?.user as any)?.image ||
    (session?.user as any)?.picture ||
    undefined;

  // ---- Room state για το header ----
  const [currentRoomName, setCurrentRoomName] = useState<string | null>(null);
  const [roomUserCount, setRoomUserCount] = useState<number | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);

  // ---- refs για αναζήτηση / φόρμα ----
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Τιμή input αναζήτησης (controlled) + εμφάνιση / απόκρυψη X
  const [searchValue, setSearchValue] = useState("");
  const [hasText, setHasText] = useState(false);

  // ---- voice search (webkitSpeechRecognition) ----
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const recognitionTimeoutRef = useRef<number | null>(null);

  // ✅ Auth helpers: ΠΑΝΤΑ login στο ίδιο origin + σωστό post-login redirect
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

  // ✅ Hidden inputs για να διατηρούνται τα filters όταν κάνεις νέα αναζήτηση από το header
  const preservedHiddenInputs = useMemo(() => {
    if (!isSongsPage) return [];

    const keysToPreserve = [
      "take",
      "chords",
      "partiture",
      "category_id",
      "rythm_id",
      "tagIds",
      "composerIds",
      "lyricistIds",
      "singerFrontIds",
      "singerBackIds",
      "yearFrom",
      "yearTo",
      "lyrics",
      "status",
      "popular",
      "createdByUserId",
    ];

    const out: Array<{ name: string; value: string }> = [];
    for (const k of keysToPreserve) {
      const v = searchParams.get(k);
      if (v && v.trim() !== "") out.push({ name: k, value: v });
    }
    out.push({ name: "skip", value: "0" });
    return out;
  }, [isSongsPage, searchParams]);

  // Ενημέρωση searchValue από το URL
  useEffect(() => {
    const termFromUrl = searchParams.get("search_term") || "";
    setSearchValue(termFromUrl);
    setHasText(termFromUrl.trim().length > 0);
  }, [searchParams]);

  // ✅ Διαβάζουμε το current room από localStorage (ίδιο key με RoomsClient) + ακούμε event (ίδιο event name)
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

  // ✅ Φόρτωση count από /rooms-api/status (ίδιο source με Rooms page)
  useEffect(() => {
    if (!isLoggedIn || !currentRoomName) {
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
  }, [isLoggedIn, currentRoomName]);

  // Ρύθμιση voice recognition
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
  const sidebarClass = `site-sidebar${isSidebarOpen ? " visible" : ""}`;
  const overlayClass = isSidebarOpen ? "visible" : "";

  const avatarNode = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={(session?.user as any)?.name || (session?.user as any)?.email || "User avatar"}
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

  const isInRoom = isLoggedIn && !!currentRoomName;

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
                justifyContent: "flex-end",
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
                {preservedHiddenInputs.map((x) => (
                  <input key={x.name} type="hidden" name={x.name} value={x.value} />
                ))}

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
                  >
                    <i className="fas fa-microphone" />
                  </button>
                )}

                <button
                  type="submit"
                  className="button-style search-button"
                  style={{ marginLeft: 5, border: "none", background: "none", cursor: "pointer" }}
                >
                  <i className="fas fa-search" />
                </button>
              </form>
            </div>
          </div>

          <div className="header-buttons">
            {/* Rooms indicator */}
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

            {/* Avatar / Login */}
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
                title="Σύνδεση με Google"
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

      {/* Sidebar */}
      <aside id="sidebar" className={sidebarClass}>
        <button
          id="closeSidebar"
          onClick={closeSidebar}
          style={{
            position: "absolute",
            top: 2,
            right: 10,
            background: "none",
            border: "none",
            fontSize: 24,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          &times;
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 20,
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <button
            id="newsong"
            className="user-icon"
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "#fff",
              fontSize: 14,
            }}
            onClick={() => {
              closeSidebar();
              window.location.href = "/songs/song/?song_id=0";
            }}
          >
            ✚ <br />
            Τραγούδι
          </button>

          <button
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: 5,
              border: "none",
              background: "none",
              cursor: "pointer",
            }}
            onClick={() => {
              closeSidebar();
              isLoggedIn ? doSignOut() : doSignIn();
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "1.5px solid white",
                overflow: "hidden",
              }}
            >
              {avatarNode}
            </span>
            <span style={{ fontSize: 12 }}>{isLoggedIn ? "Αποσύνδεση" : "Σύνδεση"}</span>
          </button>
        </div>

        <hr
          style={{
            border: 0,
            height: 1,
            background: "#fff",
            margin: "5px auto",
            width: "95%",
          }}
        />

        <nav className="sidebar-nav">
          <ul style={{ listStyle: "none", padding: 0, marginTop: 15 }}>
            <li style={{ marginBottom: 10 }}>
              <Link
                href="/lists"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                📋 Λίστες
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/artists"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                <i className="fa-solid fa-music" /> Καλλιτέχνες
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/rooms"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                <i className="fas fa-sync-alt" /> Rooms
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/me"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                <i className="fa-solid fa-user" /> Λογαριασμός
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <a
                href="#"
                id="installAppLink"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                🛠️ Εγκατάσταση APP
              </a>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/users"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                <i className="fa-solid fa-user" /> Χρήστες
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/settings"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                ⚙️ Ρυθμίσεις
              </Link>
            </li>

            <li style={{ marginBottom: 50 }}>
              <a
                href="mailto:repertorio.net@gmail.com"
                onClick={closeSidebar}
                style={{ color: "#fff", textDecoration: "none", fontSize: 18 }}
              >
                ✉️ Επικοινωνία
              </a>
            </li>
          </ul>
        </nav>

        <div
          className="sidebar-footer"
          style={{
            marginTop: 5,
            width: "90%",
            textAlign: "center",
            paddingBottom: 5,
          }}
        >
          <div style={{ marginTop: 10, lineHeight: 1.6, textAlign: "left", fontSize: 12 }}>
            • Παρτιτούρες:{" "}
            <a href="https://notttes.blogspot.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
              notttes.blogspot.com
            </a>
            <br />
            • Ρεμπέτικα:{" "}
            <a href="https://rebetiko.sealabs.net/" target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
              rebetiko.sealabs.net
            </a>
          </div>

          <div className="version-info" style={{ fontSize: 12, marginTop: 15 }}>
            Έκδοση εφαρμογής: 1.0.0 (Next)
          </div>

          <div style={{ color: "#ffffff", textAlign: "center", marginTop: 10, fontSize: 12 }}>
            Χρήστες online: –
          </div>
        </div>
      </aside>

      <div id="overlay" className={overlayClass} onClick={closeSidebar} />
    </>
  );
}
