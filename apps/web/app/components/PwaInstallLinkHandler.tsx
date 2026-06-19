"use client";

import { useEffect, useRef } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function isIosDevice() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as any).standalone === true;
  return Boolean(standaloneMedia || iosStandalone);
}

function isLikelyChromiumBrowser() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return (
    ua.includes("chrome") ||
    ua.includes("crios") ||
    ua.includes("edg/") ||
    ua.includes("edga/") ||
    ua.includes("brave")
  );
}

function installUnavailableMessage() {
  if (isIosDevice()) {
    return (
      "Σε iPhone/iPad η εγκατάσταση γίνεται από το μενού Κοινοποίηση (Share) " +
      "→ Προσθήκη στην οθόνη Αφετηρίας (Add to Home Screen)."
    );
  }

  if (isStandaloneDisplay()) {
    return "Η εφαρμογή είναι ήδη εγκατεστημένη και τρέχει ως εφαρμογή.";
  }

  if (!window.isSecureContext) {
    return "Η εγκατάσταση χρειάζεται ασφαλή σύνδεση HTTPS.";
  }

  if (!("serviceWorker" in navigator)) {
    return "Ο browser που χρησιμοποιείς δεν υποστηρίζει εγκατάσταση εφαρμογής από αυτό το site.";
  }

  if (isLikelyChromiumBrowser()) {
    return (
      "Ο browser δεν δίνει αυτή τη στιγμή αυτόματο παράθυρο εγκατάστασης.\n\n" +
      "Μπορείς να δοκιμάσεις από το μενού του browser (⋮) → Εγκατάσταση εφαρμογής ή Προσθήκη στην αρχική οθόνη.\n\n" +
      "Αν η εφαρμογή έχει ήδη εγκατασταθεί ή αν ακυρώθηκε πρόσφατα η εγκατάσταση, ο Chrome μπορεί να κρύψει προσωρινά το παράθυρο εγκατάστασης."
    );
  }

  return (
    "Η εγκατάσταση δεν είναι διαθέσιμη σε αυτόν τον browser.\n" +
    "Δοκίμασε με Chrome, Edge ή Brave από ασφαλή σύνδεση HTTPS."
  );
}

export function PwaInstallLinkHandler() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    console.log("[PWA] PwaInstallLinkHandler mounted");

    // Πιάνουμε το beforeinstallprompt και το κρατάμε
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log("[PWA] beforeinstallprompt fired");
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
    };

    // Όταν η εφαρμογή εγκατασταθεί
    const handleAppInstalled = () => {
      console.log("[PWA] appinstalled event");
      deferredPromptRef.current = null;
      alert("Η εφαρμογή Repertorio εγκαταστάθηκε!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    const handleClick = async (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("#installAppLink");
      if (!link) return;

      event.preventDefault();
      console.log("[PWA] installAppLink clicked");

      const deferredPrompt = deferredPromptRef.current;

      if (!deferredPrompt) {
        alert(installUnavailableMessage());
        return;
      }

      try {
        console.log("[PWA] Calling deferredPrompt.prompt()...");
        await deferredPrompt.prompt();

        const choiceResult = await deferredPrompt.userChoice;
        console.log("[PWA] userChoice:", choiceResult.outcome);

        if (choiceResult.outcome === "accepted") {
          alert("Ευχαριστούμε! Η εγκατάσταση ξεκίνησε.");
        } else {
          alert("Η εγκατάσταση ακυρώθηκε από το χρήστη.");
        }
      } catch (err) {
        console.error("[PWA] Error during install prompt:", err);
        alert("Παρουσιάστηκε σφάλμα κατά την προσπάθεια εγκατάστασης.");
      } finally {
        deferredPromptRef.current = null;
      }
    };

    document.addEventListener("click", handleClick);
    console.log("[PWA] Attached delegated click handler for #installAppLink");

    // Cleanup
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}
