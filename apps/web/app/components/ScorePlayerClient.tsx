"use client";

import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

type ScorePlayerProps = {
  songId: number;
  initialZoom?: number; // π.χ. 80–120
};

export default function ScorePlayerClient({
  songId,
  initialZoom = 100,
}: ScorePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialZoom);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current) return;

      setLoading(true);
      setError(null);

      try {
        // 1) Φέρνουμε MusicXML από το νέο API
        const res = await fetch(`/api/scores/${songId}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(
            `API error (${res.status}): ${await res.text()}`
          );
        }

        const xml = await res.text();

        if (!xml.trim().startsWith("<?xml")) {
          throw new Error(
            "Το API δεν επέστρεψε έγκυρο MusicXML (λείπει το <?xml ... ?>)."
          );
        }

        if (cancelled) return;

        // 2) Δημιουργούμε OSMD
        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          drawTitle: true,
          backend: "svg",
          // Μπορείς να προσθέσεις εδώ extra options (drawPartNames, drawingParameters, κτλ.)
        });

        osmdRef.current = osmd;

        await osmd.load(xml);
        osmd.Zoom = zoom / 100;
        await osmd.render();

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err: any) {
        console.error("[ScorePlayer] Error:", err);
        if (!cancelled) {
          setError(
            err?.message || "Δεν ήταν δυνατή η φόρτωση της παρτιτούρας."
          );
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      // Δεν έχει επίσημο destroy το OSMD, αλλά καθαρίζουμε ref & DOM
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      osmdRef.current = null;
    };
  }, [songId]);

  // Χειριστές zoom
  const handleZoomChange = async (newZoom: number) => {
    if (!osmdRef.current) return;
    if (newZoom < 30) newZoom = 30;
    if (newZoom > 200) newZoom = 200;

    setZoom(newZoom);
    osmdRef.current.Zoom = newZoom / 100;
    await osmdRef.current.render();
  };

  return (
    <div
      style={{
        border: "1px solid #444",
        borderRadius: 8,
        padding: 8,
        background: "#111",
        color: "#eee",
      }}
    >
      {/* Toolbar (μίνιμαλ, μπορείς να το επεκτείνεις όσο θες) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontWeight: 600 }}>Παρτιτούρα</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => handleZoomChange(zoom - 10)}
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              border: "1px solid #555",
              background: "#222",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            −
          </button>
          <input
            type="text"
            value={`${zoom}%`}
            onChange={(e) => {
              const v = parseInt(e.target.value.replace("%", ""), 10);
              if (!Number.isNaN(v)) {
                handleZoomChange(v);
              }
            }}
            onBlur={() => {
              if (zoom < 30) handleZoomChange(30);
              if (zoom > 200) handleZoomChange(200);
            }}
            style={{
              width: 60,
              textAlign: "center",
              padding: "2px 4px",
              borderRadius: 4,
              border: "1px solid #555",
              background: "#000",
              color: "#eee",
            }}
          />
          <button
            type="button"
            onClick={() => handleZoomChange(zoom + 10)}
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              border: "1px solid #555",
              background: "#222",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Μηνύματα κατάστασης */}
      {loading && (
        <div style={{ marginBottom: 8, fontSize: 14, opacity: 0.8 }}>
          Φόρτωση παρτιτούρας...
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: "#ff6b6b",
            whiteSpace: "pre-line",
          }}
        >
          Δεν ήταν δυνατή η φόρτωση της παρτιτούρας.
          {"\n"}
          {error}
        </div>
      )}

      {/* Container OSMD */}
      <div
        ref={containerRef}
        style={{
          minHeight: 100,
          background: "#000",
          borderRadius: 4,
          padding: 4,
          overflowX: "auto",
        }}
      />
    </div>
  );
}
