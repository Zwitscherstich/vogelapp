"use client";

import { useEffect } from "react";
import { pruefeBeimOeffnen } from "@/lib/notifications";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service Worker nicht verfügbar – kein Problem
      });
    }

    // Check if a weekly reminder notification should be shown
    pruefeBeimOeffnen();
  }, []);

  return null;
}
