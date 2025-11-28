import "./global.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Repertorio Next",
  description: "Νέο Repertorio frontend πάνω στο NestJS API"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="el">
      <body>
        <main>
          <header style={{ marginBottom: "24px" }}>
            <h1>Repertorio Next</h1>
            <p style={{ opacity: 0.8 }}>
              Prototype frontend συνδεδεμένο με το νέο NestJS API.
            </p>
            <nav style={{ marginTop: "8px" }}>
              <a href="/">Αρχική</a> | <a href="/songs">Τραγούδια</a>
            </nav>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
