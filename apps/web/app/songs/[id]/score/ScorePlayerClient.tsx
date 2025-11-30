// app/songs/[id]/score/ScorePlayerClient.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Script from "next/script";

type Props = {
  fileUrl: string;
  title: string;
};

const ScorePlayerClient: React.FC<Props> = ({ fileUrl, title }) => {
  const rendererRef = useRef<HTMLDivElement | null>(null);
  const osmdInstanceRef = useRef<any>(null);

  const [osmdReady, setOsmdReady] = useState(false);
  const [jszipReady, setJszipReady] = useState(false);

  const handleOsmdLoaded = () => {
    setOsmdReady(true);
  };

  const handleJszipLoaded = () => {
    setJszipReady(true);
  };

  useEffect(() => {
    if (!osmdReady || !jszipReady) return;
    if (typeof window === "undefined") return;
    if (!rendererRef.current) return;

    const anyWin = window as any;
    const OSMDClass =
      anyWin?.opensheetmusicdisplay?.OpenSheetMusicDisplay ??
      anyWin?.OpenSheetMusicDisplay;
    const JSZipClass = anyWin?.JSZip;

    if (!OSMDClass) {
      console.error("OSMD class not found on window");
      return;
    }

    if (!JSZipClass) {
      console.error("JSZip not found on window");
      return;
    }

    async function loadAndRender() {
      try {
        // καθάρισε παλιό instance αν υπάρχει
        if (osmdInstanceRef.current) {
          try {
            osmdInstanceRef.current.clear();
          } catch {
            // ignore
          }
        }

        const osmd = new OSMDClass(rendererRef.current, {
          autoResize: true,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawingParameters: "compact",
        });

        osmdInstanceRef.current = osmd;

        const lower = fileUrl.toLowerCase();

        // Αν είναι ήδη XML, φόρτωσέ το απευθείας
        if (lower.endsWith(".xml") || lower.endsWith(".musicxml")) {
          await osmd.load(fileUrl);
          await osmd.render();
          return;
        }

        // Διαφορετικά (.mxl = zip): fetch + unzip με JSZip
        const resp = await fetch(fileUrl);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} while fetching score file`);
        }

        const arrayBuffer = await resp.arrayBuffer();
        const zip = await JSZipClass.loadAsync(arrayBuffer);

        // Βρες το πρώτο .xml / .musicxml μέσα στο zip
        let xmlFileName: string | null = null;
        zip.forEach((relativePath: string) => {
          const name = relativePath.toLowerCase();
          if (
            !xmlFileName &&
            (name.endsWith(".xml") || name.endsWith(".musicxml"))
          ) {
            xmlFileName = relativePath;
          }
        });

        if (!xmlFileName) {
          throw new Error("No XML file found inside MXL archive");
        }

        const xmlFile = zip.file(xmlFileName);
        if (!xmlFile) {
          throw new Error("XML file entry not found (JSZip)");
        }

        const xmlString: string = await xmlFile.async("string");

        await osmd.load(xmlString);
        await osmd.render();
      } catch (err) {
        console.error("Error while loading/rendering score", err);
      }
    }

    loadAndRender();
  }, [osmdReady, jszipReady, fileUrl]);

  return (
    <>
      {/* CSS του score-player (κουμπιά κτλ.) */}
      <link rel="stylesheet" href="/score-player/score-player.css" />

      <div
        className="score-player"
        data-file={fileUrl}
        data-title={title}
        data-transpose="0"
        style={{
          marginTop: 24,
          marginBottom: 32,
          backgroundColor: "#000",
          padding: "12px",
          borderRadius: 8,
          border: "1px solid #333",
        }}
      >
        <div className="sp-toolbar">
          <div className="sp-transpose-group">
            <button type="button" className="sp-transpose-down">
              -
            </button>
            <span className="sp-transpose-val">0</span>
            <button type="button" className="sp-transpose-up">
              +
            </button>
          </div>

          <div className="sp-tempo-group">
            <label style={{ marginRight: 4 }}>Tempo:</label>
            <input
              type="number"
              className="sp-tempo"
              defaultValue={120}
              min={40}
              max={240}
            />
            <span className="sp-tempo-val" />
          </div>

          <div className="sp-playback-group">
            <button type="button" className="sp-play" disabled>
              ▶
            </button>
            <button type="button" className="sp-pause" disabled>
              ⏸
            </button>
            <button type="button" className="sp-stop" disabled>
              ⏹
            </button>
          </div>
        </div>

        <div
          className="sp-renderer"
          ref={rendererRef}
          style={{
            marginTop: 16,
            minHeight: 300,
            backgroundColor: "#fff",
            borderRadius: 8,
          }}
        />
      </div>

      {/* OSMD από CDN */}
      <Script
        src="https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.1/build/opensheetmusicdisplay.min.js"
        strategy="afterInteractive"
        onLoad={handleOsmdLoaded}
      />

      {/* JSZip για unzip των .mxl */}
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
        strategy="afterInteractive"
        onLoad={handleJszipLoaded}
      />
    </>
  );
};

export default ScorePlayerClient;
