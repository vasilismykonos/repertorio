// apps/web/app/components/GoogleLoginButton.tsx
"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback } from "react";

export default function GoogleLoginButton() {
  const { data: session, status } = useSession();
  const loading = status === "loading";

  const getSameOriginCallbackUrl = useCallback(() => {
    if (typeof window === "undefined") return "/";
    return window.location.pathname + window.location.search || "/";
  }, []);

  const doSignIn = useCallback(() => {
    void signIn("google", { callbackUrl: getSameOriginCallbackUrl() });
  }, [getSameOriginCallbackUrl]);

  const doSignOut = useCallback(() => {
    void signOut({ callbackUrl: getSameOriginCallbackUrl() });
  }, [getSameOriginCallbackUrl]);

  // Loader ενώ ετοιμάζεται το session
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

  // Δεν είναι συνδεδεμένος
  if (!session) {
    return (
      <button
        type="button"
        onClick={doSignIn}
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

  // Είναι συνδεδεμένος
  const avatarUrl =
    (session.user as any).image ||
    (session.user as any).picture ||
    "/images/default-avatar.png";

  const altText = session.user?.name || session.user?.email || "User avatar";

  return (
    <button
      type="button"
      onClick={doSignOut}
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
