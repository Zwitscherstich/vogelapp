"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  istAktiviert,
  setAktiviert,
  requestPermission,
  scheduleWochenerinnerung,
} from "@/lib/notifications";

export default function Navigation() {
  const [offen, setOffen] = useState(false);
  const pathname = usePathname();

  const [benachrichtigungenAktiv, setBenachrichtigungenAktiv] = useState(false);
  const [benachrichtigungenUnterstuetzt, setBenachrichtigungenUnterstuetzt] =
    useState(false);

  useEffect(() => {
    setBenachrichtigungenUnterstuetzt("Notification" in window);
    setBenachrichtigungenAktiv(
      istAktiviert() && "Notification" in window && Notification.permission === "granted"
    );
  }, []);

  async function toggleBenachrichtigungen() {
    if (benachrichtigungenAktiv) {
      setAktiviert(false);
      setBenachrichtigungenAktiv(false);
    } else {
      const granted = await requestPermission();
      if (granted) {
        setAktiviert(true);
        setBenachrichtigungenAktiv(true);
        await scheduleWochenerinnerung();
      }
    }
  }

  const links = [
    { href: "/", label: "Neue Beobachtung", icon: "+" },
    { href: "/beobachtungen", label: "Beobachtungen", icon: "📋" },
    { href: "/vogelarten", label: "Vogelarten", icon: "🐦" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
  ];

  return (
    <nav className="bg-white border-b border-stone-200 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-emerald-700" data-vogel-logo>
          <span className="select-none">🐦</span> Vogeltagebuch
        </Link>

        {/* Desktop-Menü */}
        <div className="hidden sm:flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors ${
                pathname === link.href
                  ? "text-emerald-700 font-medium"
                  : "text-stone-600 hover:text-emerald-700"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {benachrichtigungenUnterstuetzt && (
            <button
              onClick={toggleBenachrichtigungen}
              title={
                benachrichtigungenAktiv
                  ? "Wochenerinnerungen aktiv – klicken zum Deaktivieren"
                  : "Wochenerinnerungen aktivieren"
              }
              className={`text-lg transition-opacity ${
                benachrichtigungenAktiv
                  ? "opacity-100"
                  : "opacity-40 hover:opacity-70"
              }`}
            >
              {benachrichtigungenAktiv ? "🔔" : "🔕"}
            </button>
          )}
        </div>

        {/* Hamburger-Button (nur mobil) */}
        <button
          onClick={() => setOffen(!offen)}
          className="sm:hidden flex flex-col gap-1.5 p-2"
          aria-label="Menü öffnen"
        >
          <span
            className={`block w-6 h-0.5 bg-stone-700 transition-transform ${offen ? "rotate-45 translate-y-2" : ""}`}
          />
          <span
            className={`block w-6 h-0.5 bg-stone-700 transition-opacity ${offen ? "opacity-0" : ""}`}
          />
          <span
            className={`block w-6 h-0.5 bg-stone-700 transition-transform ${offen ? "-rotate-45 -translate-y-2" : ""}`}
          />
        </button>
      </div>

      {/* Mobiles Dropdown-Menü */}
      {offen && (
        <div className="sm:hidden border-t border-stone-200 bg-white">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOffen(false)}
              className={`block px-4 py-3 text-sm border-b border-stone-100 transition-colors ${
                pathname === link.href
                  ? "bg-emerald-50 text-emerald-700 font-medium"
                  : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              {link.icon} {link.label}
            </Link>
          ))}
          {benachrichtigungenUnterstuetzt && (
            <button
              onClick={() => {
                toggleBenachrichtigungen();
                setOffen(false);
              }}
              className="block w-full text-left px-4 py-3 text-sm border-b border-stone-100 text-stone-600 hover:bg-stone-50 transition-colors"
            >
              {benachrichtigungenAktiv ? "🔔" : "🔕"}{" "}
              {benachrichtigungenAktiv
                ? "Wochenerinnerungen deaktivieren"
                : "Wochenerinnerungen aktivieren"}
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
