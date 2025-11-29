// app/components/GoogleLoginButton.tsx
"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function GoogleLoginButton() {
  const { data: session, status } = useSession();
  const loading = status === "loading";

  // Εμφάνιση loader ενώ ετοιμάζεται το session
  if (loading) {
    return (
      <button
        type="button"
        style={{
          padding: "6px 12px",
          borderRadius: "999px",
          border: "1px solid #fff",
          background: "transparent",
          color: "#fff",
          cursor: "not-allowed",
          opacity: 0.6,
          fontSize: "14px",
        }}
      >
        …
      </button>
    );
  }

  // ΑΝ ΔΕΝ είναι συνδεδεμένος → κλασικό κουμπί "Σύνδεση με Google"
  if (!session) {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "999px",
          border: "1px solid #fff",
          background: "transparent",
          color: "#fff",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        {/* Μικρό "G" bubble – μπορείς να το αντικαταστήσεις με SVG αργότερα */}
        <span
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            color: "#4285F4",
            fontWeight: 700,
          }}
        >
          G
        </span>
        <span>Σύνδεση με Google</span>
      </button>
    );
  }

  // ΑΝ είναι συνδεδεμένος → avatar όπως στο WordPress
  const avatarUrl =
    (session.user as any).image ||
    (session.user as any).picture ||
    "/images/default-avatar.png"; // βάλε ένα default στο /public/images/

  const altText = session.user?.name || session.user?.email || "User avatar";

  return (
    <button
      type="button"
      onClick={() => signOut()}
      title="Αποσύνδεση"
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        cursor: "pointer",
      }}
    >
      <img
        src={avatarUrl}
        alt={altText}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          objectFit: "cover",
          border: "1px solid #fff",
          display: "block",
        }}
      />
    </button>
  );
}
