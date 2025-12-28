// app/components/Header.tsx
"use client";


import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function Header() {
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

  // ---- search params από το URL ----
  const searchParams = useSearchParams();

  // Ενημέρωση searchValue από το URL (ώστε να μην χάνεται μετά την αναζήτηση)
  useEffect(() => {
    const termFromUrl = searchParams.get("search_term") || "";
    setSearchValue(termFromUrl);
    setHasText(termFromUrl.trim().length > 0);
  }, [searchParams]);

  // Διαβάζουμε το rep_current_room από το localStorage και ακούμε αλλαγές
  useEffect(() => {
    if (typeof window === "undefined") return;

    const readFromStorage = () => {
      try {
        const stored = window.localStorage.getItem("rep_current_room");
        if (stored && stored.trim() !== "") {
          setCurrentRoomName(stored.trim());
        } else {
          setCurrentRoomName(null);
        }
      } catch {
        setCurrentRoomName(null);
      }
    };

    // αρχική ανάγνωση
    readFromStorage();

    const handleStorage = (event: StorageEvent | Event) => {
      // Αλλαγές από άλλα tabs
      if (event instanceof StorageEvent) {
        if (event.key === "rep_current_room") {
          readFromStorage();
        }
        return;
      }

      // Custom event π.χ. από RoomsClient: rep_current_room_changed
      if ((event as any).type === "rep_current_room_changed") {
        readFromStorage();
      }
    };

    window.addEventListener("storage", handleStorage as any);
    window.addEventListener(
      "rep_current_room_changed",
      handleStorage as any
    );

    return () => {
      window.removeEventListener("storage", handleStorage as any);
      window.removeEventListener(
        "rep_current_room_changed",
        handleStorage as any
      );
    };
  }, []);

  // Φόρτωση πλήθους χρηστών για το currentRoom από /api/rooms
  useEffect(() => {
    if (!isLoggedIn || !currentRoomName) {
      setRoomUserCount(null);
      return;
    }

    let cancelled = false;

    const fetchRoomCount = async () => {
      try {
        setRoomLoading(true);
        const res = await fetch("/api/rooms", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Αποτυχία φόρτωσης rooms");
        }

        const data = (await res.json()) as {
          room: string;
          userCount?: number;
          hasPassword?: boolean;
        }[];

        if (cancelled) return;

        const match = data.find(
          (r) =>
            r.room &&
            r.room.toLowerCase() === currentRoomName.toLowerCase()
        );

        if (match && typeof match.userCount === "number") {
          setRoomUserCount(match.userCount);
        } else {
          setRoomUserCount(null);
        }
      } catch {
        if (!cancelled) {
          setRoomUserCount(null);
        }
      } finally {
        if (!cancelled) {
          setRoomLoading(false);
        }
      }
    };

    fetchRoomCount();

    // ανανέωση κάθε 10 δευτερόλεπτα
    const id = setInterval(fetchRoomCount, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
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

      // ενημέρωση controlled state
      setSearchValue(transcript);
      setHasText(transcript.trim().length > 0);

      if (searchInputRef.current) {
        searchInputRef.current.value = transcript;
      }

      window.setTimeout(() => {
        formRef.current?.submit();
      }, 300);
    };

    recognition.onspeechend = () => {
      if (recognitionTimeoutRef.current !== null) {
        window.clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }
      recognition.stop();
    };

    recognition.onerror = () => {
      if (recognitionTimeoutRef.current !== null) {
        window.clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }
      recognition.stop();
    };

    return () => {
      if (recognitionTimeoutRef.current !== null) {
        window.clearTimeout(recognitionTimeoutRef.current);
      }
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleVoiceSearchClick = () => {
    if (!recognitionRef.current) return;

    // καθαρισμός πριν ξεκινήσει η φωνητική
    setSearchValue("");
    setHasText(false);
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }

    recognitionRef.current.start();

    if (recognitionTimeoutRef.current !== null) {
      window.clearTimeout(recognitionTimeoutRef.current);
    }
    recognitionTimeoutRef.current = window.setTimeout(() => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
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

  const openSidebar = () => setIsSidebarOpen(true);
  const closeSidebar = () => setIsSidebarOpen(false);

  const sidebarClass = `site-sidebar${isSidebarOpen ? " visible" : ""}`;
  const overlayClass = `overlay${isSidebarOpen ? " visible" : ""}`;

  // κοινό JSX για avatar (header + sidebar)
  const avatarNode = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={session?.user?.name || session?.user?.email || "User avatar"}
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

  return (
    <>
      {/* ΚΕΦΑΛΙ / HEADER */}
      <header className="site-header">
        <div className="header-container">
          {/* ΛΟΓΟΤΥΠΟ */}
          <div className="header-logo">
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              <img
                src="/images/default-logo.png"
                alt="Repertorio.net logo"
                style={{
                  maxWidth: 31,
                  height: "auto",
                  borderRadius: 8,
                }}
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

          {/* ΑΝΑΖΗΤΗΣΗ */}
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
              <div
                className="menu-button-wrapper"
                style={{ display: "inline-block" }}
              >
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
                method="GET"
                action="/songs"
                style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  maxWidth: 400,
                  width: "100%",
                  marginLeft: 8,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    flex: 1,
                  }}
                >
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
                    style={{
                      marginLeft: 5,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                    }}
                    onClick={handleVoiceSearchClick}
                  >
                    <i className="fas fa-microphone" />
                  </button>
                )}

                <button
                  type="submit"
                  className="button-style search-button"
                  style={{
                    marginLeft: 5,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                  }}
                >
                  <i className="fas fa-search" />
                </button>
              </form>
            </div>
          </div>

          {/* ΔΕΞΙΑ ΚΟΥΜΠΙΑ – Room, Avatar, Menu */}
          <div className="header-buttons">
            {/* Κουμπί Rooms */}
            <Link
              href="/rooms"
              className="rooms-button"
              title={currentRoomName ? `Rooms: ${currentRoomName}` : "Rooms"}
            >
              <span className="rooms-icon">
                {!isLoggedIn || !currentRoomName
                  ? "🔄"
                  : roomUserCount != null && roomUserCount > 0
                  ? `🔄${roomUserCount}`
                  : "🔄"}
              </span>
            </Link>

            {/* AVATAR HEADER */}
            <button
              type="button"
              onClick={() => (isLoggedIn ? signOut() : signIn("google"))}
              title={isLoggedIn ? "Αποσύνδεση" : "Σύνδεση με Google"}
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
              {avatarNode}
            </button>

            {/* Κουμπί που ανοίγει το πλαϊνό μενού */}
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
              onClick={openSidebar}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* ΠΛΑΙΝΟ ΜΕΝΟΥ (Sidebar μέσα στο Header) */}
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

        {/* Πάνω μέρος: Νέο τραγούδι + Login/Logout */}
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
              isLoggedIn ? signOut() : signIn("google");
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
            <span style={{ fontSize: 12 }}>
              {isLoggedIn ? "Αποσύνδεση" : "Σύνδεση"}
            </span>
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

        {/* MENU ITEMS */}
        <nav className="sidebar-nav">
          <ul style={{ listStyle: "none", padding: 0, marginTop: 15 }}>
            <li style={{ marginBottom: 10 }}>
              <Link
                href="/lists"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                📋 Λίστες
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/artists"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                <i className="fa-solid fa-music" /> Καλλιτέχνες
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/rooms"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                <i className="fas fa-sync-alt" /> Rooms
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/history_changes"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                <i className="fas fa-history" /> Ιστορικό αλλαγών
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <Link
                href="/profile"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                <i className="fa-solid fa-user" /> Προφίλ
              </Link>
            </li>

            <li style={{ marginBottom: 10 }}>
              <a
                href="#"
                id="installAppLink"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                🛠️ Εγκατάσταση APP
              </a>
            </li>

            {/* Χρήστες → /users */}
            <li style={{ marginBottom: 10 }}>
              <Link
                href="/users"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                <i className="fa-solid fa-user" /> Χρήστες
              </Link>
            </li>

                        <li style={{ marginBottom: 10 }}>
              <Link
                href="/settings"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                ⚙️ Ρυθμίσεις
              </Link>
            </li>

     
            <li style={{ marginBottom: 50 }}>
              <a
                href="mailto:repertorio.net@gmail.com"
                onClick={closeSidebar}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                ✉️ Επικοινωνία
              </a>
            </li>
          </ul>
        </nav>

        {/* FOOTER SIDEBAR */}
        <div
          className="sidebar-footer"
          style={{
            marginTop: 5,
            width: "90%",
            textAlign: "center",
            paddingBottom: 5,
          }}
        >
          <div
            style={{
              marginTop: 10,
              lineHeight: 1.6,
              textAlign: "left",
              fontSize: 12,
            }}
          >
            • Παρτιτούρες:{" "}
            <a
              href="https://notttes.blogspot.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#fff" }}
            >
              notttes.blogspot.com
            </a>
            <br />
            • Ρεμπέτικα:{" "}
            <a
              href="https://rebetiko.sealabs.net/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#fff" }}
            >
              rebetiko.sealabs.net
            </a>
          </div>

          <div className="version-info" style={{ fontSize: 12, marginTop: 15 }}>
            Έκδοση εφαρμογής: 1.0.0 (Next)
          </div>

          <div
            style={{
              color: "#ffffff",
              textAlign: "center",
              marginTop: 10,
              fontSize: 12,
            }}
          >
            Χρήστες online: –
          </div>
        </div>
      </aside>

      {/* Overlay για το sidebar */}
      <div id="overlay" className={overlayClass} onClick={closeSidebar} />
    </>
  );
}
