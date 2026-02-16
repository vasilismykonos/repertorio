// app/layout.tsx

import "./styles/globals.css";
import "./styles/buttons.css";
import "./styles/score-player.css";

import type { ReactNode } from "react";
import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import Header from "./components/Header";
import Footer from "./components/Footer";
import Providers from "./Providers";
import { PwaProvider } from "./PwaProvider";
import { PwaInstallLinkHandler } from "./components/PwaInstallLinkHandler";
import PpSplash from "./components/ppSplash";

// ✅ Host-based metadata (dev.repertorio.net vs prod)
// (Πιο σωστό από NODE_ENV όταν το dev domain σερβίρεται από production build)
export function generateMetadata(): Metadata {
  const host = headers().get("host") || "";
  const isDevHost = host.toLowerCase().startsWith("dev.");

  return {
    title: isDevHost ? "Repertorio DEV" : "Repertorio.net",
    description: "Πλατφόρμα μουσικής για επαγγελματίες και ερασιτέχνες μουσικούς",

    manifest: isDevHost ? "/manifest.dev.webmanifest" : "/manifest.webmanifest",
    themeColor: "#111111",

    icons: {
      icon: [
        { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
      shortcut: ["/favicon.ico"],
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const host = headers().get("host") || "";
  const isDevHost = host.toLowerCase().startsWith("dev.");

  return (
    <html lang="el" data-env={isDevHost ? "dev" : "prod"}>
      <head>
        {/* External CSS (ok να μείνει εδώ) */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        />
      </head>

      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#000",
          color: "#fff",
          fontFamily: "Verdana, sans-serif",
        }}
      >
        {/* SVG animated splash (και στο web και στο PWA) */}
        <PpSplash />

        {/* Service worker / PWA setup */}
        <PwaProvider />

        {/* Σύνδεση του link #installAppLink με το PWA install */}
        <PwaInstallLinkHandler />

        <Providers>
          <Suspense fallback={null}>
            <Header />
          </Suspense>

          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
