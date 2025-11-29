"use client";

import { useEffect, useRef } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

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

    // Συνδέουμε το click στο <a id="installAppLink">
    const link = document.getElementById("installAppLink");

    const handleClick = async (event: Event) => {
      event.preventDefault();
      console.log("[PWA] installAppLink clicked");

      const deferredPrompt = deferredPromptRef.current;

      if (!deferredPrompt) {
        // Δεν έχουμε διαθέσιμο prompt
        if (/iphone|ipad|ipod/i.test(window.navigator.userAgent)) {
          alert(
            "Σε iPhone/iPad η εγκατάσταση γίνεται από το μενού Κοινοποίηση (Share) " +
              "→ Προσθήκη στην οθόνη Αφετηρίας (Add to Home Screen)."
          );
        } else {
          alert(
            "Η εγκατάσταση δεν είναι διαθέσιμη αυτή τη στιγμή.\n" +
              "Έλεγξε ότι:\n" +
              "• Χρησιμοποιείς Chrome/Edge/Brave.\n" +
              "• Το site φορτώνει μέσω HTTPS.\n" +
              "• Η εφαρμογή δεν είναι ήδη εγκατεστημένη."
          );
        }
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

    if (link) {
      link.addEventListener("click", handleClick);
      console.log("[PWA] Attached click handler to #installAppLink");
    } else {
      console.warn("[PWA] #installAppLink not found in DOM");
    }

    // Cleanup
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);

      if (link) {
        link.removeEventListener("click", handleClick);
      }
    };
  }, []);

  return null;
}
