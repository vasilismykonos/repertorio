// app/layout.tsx

import "./styles/globals.css";
import "./styles/buttons.css";
import "./styles/score-player.css";
import type { ReactNode } from "react";
import { Suspense } from "react";             // 🔹 ΠΡΟΣΘΗΚΗ
import type { Metadata } from "next";

import Header from "./components/Header";
import Footer from "./components/Footer";
import Providers from "./Providers";
import { PwaProvider } from "./PwaProvider";
import { PwaInstallLinkHandler } from "./components/PwaInstallLinkHandler";

export const metadata: Metadata = {
  title: "Repertorio.net",
  description: "Πλατφόρμα μουσικής για επαγγελματίες και ερασιτέχνες μουσικούς",
  manifest: "/manifest.webmanifest",
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="el">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#111111" />

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
        {/* Service worker */}
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
