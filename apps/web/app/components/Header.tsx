// app/components/Header.tsx
"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Header() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ---- NextAuth session ----
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";

  const avatarUrl =
    (session?.user as any)?.image ||
    (session?.user as any)?.picture ||
    undefined;

  // ---- refs για αναζήτηση / φόρμα ----
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Εμφάνιση / απόκρυψη X
  const [hasText, setHasText] = useState(false);

  // ---- voice search (webkitSpeechRecognition) ----
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const recognitionTimeoutRef = useRef<number | null>(null);

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

      if (searchInputRef.current) {
        searchInputRef.current.value = transcript;
        setHasText(transcript.trim().length > 0);
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

    if (searchInputRef.current) {
      searchInputRef.current.value = "";
      setHasText(false);
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
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
      searchInputRef.current.focus();
    }
    setHasText(false);
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
                <button
                  type="button"
                  className="button"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "1.5em",
                  }}
                >
                  <i className="fas fa-sliders-h" />
                </button>
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
                    style={{
                      width: "100%",
                      border: "1px solid #ccc",
                      borderRadius: 50,
                      padding: "8px 10px 8px 12px",
                      fontSize: 15,
                    }}
                    autoComplete="off"
                    onChange={(e) =>
                      setHasText(e.target.value.trim().length > 0)
                    }
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
            <Link
              href="/rooms"
              style={{ textDecoration: "none", color: "#fff" }}
              title="Room"
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 3,
                    background: "#1a73e8",
                    display: "inline-block",
                  }}
                />
                Room
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
            onClick={() => (isLoggedIn ? signOut() : signIn("google"))}
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
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                🛠️ Εγκατάσταση APP
              </a>
            </li>

            {/* ΕΔΩ η διόρθωση: Χρήστες → /users */}
            <li style={{ marginBottom: 10 }}>
              <Link
                href="/users"
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: 18,
                }}
              >
                <i className="fa-solid fa-user" /> Χρήστες
              </Link>
            </li>

            <li style={{ marginBottom: 50 }}>
              <a
                href="mailto:repertorio.net@gmail.com"
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
