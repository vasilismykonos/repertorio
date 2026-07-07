// apps/web/app/lists/share/[token]/ListShareLoginClient.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";

type Props = {
  listTitle: string;
  role: "SONGS_EDITOR" | "VIEWER";
};

function roleLabel(role: Props["role"]) {
  return role === "SONGS_EDITOR" ? "επεξεργασία" : "ανάγνωση";
}

export default function ListShareLoginClient({ listTitle, role }: Props) {
  const [busy, setBusy] = useState(false);

  const handleSignIn = () => {
    setBusy(true);
    const callbackUrl = typeof window !== "undefined" ? window.location.href : "/lists";
    void signIn("google", { callbackUrl });
  };

  return (
    <section
      style={{
        width: "min(680px, calc(100% - 24px))",
        margin: "clamp(28px, 8vh, 86px) auto",
        padding: "24px",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.07)",
        boxShadow: "0 18px 54px rgba(0,0,0,0.34)",
        color: "#fff",
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.62)", textTransform: "uppercase" }}>
          Κοινή χρήση λίστας
        </div>
        <h1 style={{ margin: 0, fontSize: "clamp(26px, 5vw, 38px)", lineHeight: 1.1 }}>
          {listTitle || "Λίστα Repertorio"}
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", fontSize: 16, lineHeight: 1.5 }}>
          Για να λάβεις δικαίωμα {roleLabel(role)} στη λίστα, συνδέσου με Google. Μετά τη σύνδεση θα
          μεταφερθείς αυτόματα στη λίστα.
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy}
          style={{
            marginTop: 8,
            justifySelf: "start",
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: 12,
            padding: "11px 16px",
            background: busy ? "rgba(255,255,255,0.16)" : "#0d6efd",
            color: "#fff",
            fontWeight: 900,
            cursor: busy ? "default" : "pointer",
            boxShadow: "0 10px 24px rgba(13,110,253,0.26)",
          }}
        >
          <LogIn size={18} />
          {busy ? "Άνοιγμα Google..." : "Σύνδεση με Google"}
        </button>
      </div>
    </section>
  );
}
