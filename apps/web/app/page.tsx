// app/songs/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Τραγούδια | Repertorio Next",
  description: "Απλή δοκιμαστική σελίδα λίστας τραγουδιών.",
};

export default function SongsPage() {
  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "28px", marginBottom: "16px" }}>Τραγούδια</h1>

      <p style={{ marginBottom: "16px" }}>
        Αυτή είναι μια δοκιμαστική σελίδα <strong>/songs</strong> στο
        Repertorio Next. Απλώς ελέγχουμε ότι το routing με{" "}
        <code>basePath =&quot;/nextgen&quot;</code> δουλεύει σωστά.
      </p>

      <p style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ marginRight: "12px" }}>
          ← Πίσω στην αρχική
        </Link>
      </p>

      <ul>
        <li>Τραγούδι 1 (placeholder)</li>
        <li>Τραγούδι 2 (placeholder)</li>
        <li>Τραγούδι 3 (placeholder)</li>
      </ul>
    </main>
  );
}
