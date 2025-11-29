"use client";

export function InstallAppButton() {
  return (
    <button
      type="button"
      // Προσθέτουμε ΚΑΘΑΡΟ HTML onclick που θα εκτελεστεί ακόμα και χωρίς React
      {...({ onclick: "alert('TEST inline onclick: έγινε κλικ στο κουμπί Εγκατάσταση APP')" } as any)}
      style={{
        borderRadius: "999px",
        border: "1px solid #ffcc00",
        padding: "8px 12px",
        fontSize: "14px",
        background: "transparent",
        color: "#ffcc00",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
    >
      🛠️ Εγκατάσταση APP (inline test)
    </button>
  );
}
