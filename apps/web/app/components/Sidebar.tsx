"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { InstallAppButton } from "./InstallAppButton";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Sidebar component for the Repertorio application.
 */
export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const variants = {
    hidden: { x: "100%" },
    visible: { x: 0 },
  };

  useEffect(() => {
    console.log("[Sidebar] *** Sidebar φορτώθηκε ***");
  }, [isOpen]);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onClose}
        />
      )}

      <motion.aside
        className="fixed top-0 right-0 h-full w-72 bg-[var(--repertorio-sidebar-bg)] text-white z-50 shadow-xl flex flex-col"
        initial="hidden"
        animate={isOpen ? "visible" : "hidden"}
        variants={variants}
        transition={{ type: "tween", duration: 0.3 }}
      >
        {/* Close button */}
        <button
          className="absolute top-2 right-3 text-2xl font-bold"
          onClick={onClose}
          aria-label="Close menu"
        >
          ×
        </button>

        {/* Links */}
        <nav className="mt-14 px-4 space-y-4 text-lg">
          <Link href="/lists" className="block hover:text-[var(--repertorio-primary)]">
            📋 Λίστες
          </Link>
          <Link href="/artists" className="block hover:text-[var(--repertorio-primary)]">
            🎵 Καλλιτέχνες
          </Link>
          <Link href="/rooms" className="block hover:text-[var(--repertorio-primary)]">
            🔄 Rooms
          </Link>
          <Link
            href="/history_changes"
            className="block hover:text-[var(--repertorio-primary)]"
          >
            🕒 Ιστορικό αλλαγών
          </Link>
          <Link href="/profile" className="block hover:text-[var(--repertorio-primary)]">
            🙍‍♂️ Προφίλ
          </Link>
          <Link
            href="mailto:repertorio.net@gmail.com"
            className="block hover:text-[var(--repertorio-primary)]"
          >
            ✉️ Επικοινωνία
          </Link>

          {/* Εγκατάσταση ως APP */}
          <div className="pt-2 border-t border-white/20 mt-4">
            <InstallAppButton />
          </div>
        </nav>

        {/* Footer */}
        <div className="mt-auto px-4 pb-6 text-sm opacity-80">
          <div className="mb-4">
            <strong>Πηγές:</strong>
            <br />• Πληροφορίες:{" "}
            <Link
              href="https://rebetiko.sealabs.net"
              target="_blank"
              className="underline"
            >
              Rebetiko Sealabs
            </Link>
            <br />• Παρτιτούρες:{" "}
            <Link
              href="https://notttes.blogspot.com/"
              target="_blank"
              className="underline"
            >
              Παίξε μπουζούκι, παίξε…
            </Link>
          </div>
          <div className="mb-2">Έκδοση: 1.0.0</div>
        </div>
      </motion.aside>
    </>
  );
}
