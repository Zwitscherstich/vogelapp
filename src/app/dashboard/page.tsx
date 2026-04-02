"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import * as XLSX from "xlsx";

interface RawBeobachtung {
  id: number;
  datum: string;
  ort: string;
  land: string;
}

interface ArtVerknuepfung {
  beobachtung_id: number;
  vogelart_id: number;
  vogelarten: { name: string } | null;
}

interface BeobachtungMitArten {
  id: number;
  datum: string;
  ort: string;
  land: string;
  vogelarten: string[];
}

const FARBEN = [
  "#059669", "#0d9488", "#0284c7", "#7c3aed", "#db2777",
  "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#9333ea",
];

export default function DashboardPage() {
  const [beobachtungen, setBeobachtungen] = useState<BeobachtungMitArten[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    async function ladeDaten() {
      const [beobResult, artenResult] = await Promise.all([
        supabase
          .from("beobachtungen")
          .select("id, datum, ort, land")
          .order("datum", { ascending: true }),
        supabase
          .from("beobachtung_vogelarten")
          .select("beobachtung_id, vogelart_id, vogelarten(name)"),
      ]);

      const beob = beobResult.data as RawBeobachtung[] | null;
      if (!beob) {
        setLaden(false);
        return;
      }

      const artenMap = new Map<number, string[]>();
      for (const a of (artenResult.data as unknown as ArtVerknuepfung[]) ?? []) {
        const name = (a.vogelarten as unknown as { name: string })?.name ?? "";
        if (!name) continue;
        const liste = artenMap.get(a.beobachtung_id) ?? [];
        liste.push(name);
        artenMap.set(a.beobachtung_id, liste);
      }

      const ergebnisse: BeobachtungMitArten[] = beob.map((b) => ({
        ...b,
        vogelarten: artenMap.get(b.id) ?? [],
      }));

      setBeobachtungen(ergebnisse);
      setLaden(false);
    }
    ladeDaten();
  }, []);

  const stats = useMemo(() => {
    if (beobachtungen.length === 0) return null;

    const heute = new Date();
    const diesesJahr = heute.getFullYear();

    // Alle einzigartigen Arten
    const alleArten = new Set<string>();
    const artenDiesesJahr = new Set<string>();
    const beobDiesesJahr = beobachtungen.filter(
      (b) => new Date(b.datum).getFullYear() === diesesJahr
    );

    for (const b of beobachtungen) {
      for (const art of b.vogelarten) alleArten.add(art);
    }
    for (const b of beobDiesesJahr) {
      for (const art of b.vogelarten) artenDiesesJahr.add(art);
    }

    // Einzigartige Orte und Länder
    const orte = new Set(beobachtungen.map((b) => b.ort));
    const laender = new Set(beobachtungen.map((b) => b.land));

    // Erstes Sichtungsdatum pro Art (für Neuentdeckungen)
    const ersteSichtung = new Map<string, string>();
    for (const b of beobachtungen) {
      for (const art of b.vogelarten) {
        if (!ersteSichtung.has(art) || b.datum < ersteSichtung.get(art)!) {
          ersteSichtung.set(art, b.datum);
        }
      }
    }

    // Tage seit letzter Neuentdeckung
    const sichtungsDaten = [...ersteSichtung.values()].sort().reverse();
    const letzteNeuentdeckung = sichtungsDaten[0];
    const tageSeitNeuentdeckung = letzteNeuentdeckung
      ? Math.max(
          0,
          Math.floor(
            (heute.getTime() -
              new Date(letzteNeuentdeckung + "T00:00:00").getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

    // Neuentdeckungen dieses Jahr
    const neueArtenDiesesJahr = [...ersteSichtung.entries()].filter(
      ([, datum]) => new Date(datum).getFullYear() === diesesJahr
    ).length;

    // Beobachtungen pro Monat (letzte 12 Monate)
    const monateLabels: string[] = [];
    const monateDaten: { monat: string; anzahl: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("de-DE", {
        month: "short",
        year: "2-digit",
      });
      monateLabels.push(label);
      const count = beobachtungen.filter((b) => b.datum.startsWith(key)).length;
      monateDaten.push({ monat: label, anzahl: count });
    }

    // Kumulative Artenentdeckung
    const sortierteEntdeckungen = [...ersteSichtung.entries()]
      .sort(([, a], [, b]) => a.localeCompare(b));
    const kumulativ: { datum: string; arten: number }[] = [];
    let count = 0;
    for (const [, datum] of sortierteEntdeckungen) {
      count++;
      const label = new Date(datum + "T00:00:00").toLocaleDateString("de-DE", {
        month: "short",
        year: "2-digit",
      });
      // Nur einen Punkt pro Datum
      const existing = kumulativ.find((k) => k.datum === label);
      if (existing) {
        existing.arten = count;
      } else {
        kumulativ.push({ datum: label, arten: count });
      }
    }

    // Top 10 Vogelarten (häufigste)
    const artHaeufigkeit = new Map<string, number>();
    for (const b of beobachtungen) {
      for (const art of b.vogelarten) {
        artHaeufigkeit.set(art, (artHaeufigkeit.get(art) ?? 0) + 1);
      }
    }
    const topArten = [...artHaeufigkeit.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, anzahl]) => ({ name, anzahl }));

    // Top 5 Orte
    const ortHaeufigkeit = new Map<string, number>();
    for (const b of beobachtungen) {
      ortHaeufigkeit.set(b.ort, (ortHaeufigkeit.get(b.ort) ?? 0) + 1);
    }
    const topOrte = [...ortHaeufigkeit.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, anzahl]) => ({ name, anzahl }));

    // ISO-Wochennummer berechnen
    function getISOWeek(d: Date): string {
      const date = new Date(d.getTime());
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
      const week1 = new Date(date.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
      return `${date.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    }

    // Wochen-basierte Serie
    const einzigartigeDaten = [...new Set(beobachtungen.map((b) => b.datum))].sort();
    const beobWochen = [...new Set(
      beobachtungen.map((b) => getISOWeek(new Date(b.datum + "T00:00:00")))
    )].sort();

    let maxStreakWochen = 0;
    let aktuellerStreakW = 1;
    for (let i = 1; i < beobWochen.length; i++) {
      const [prevY, prevW] = beobWochen[i - 1].split("-W").map(Number);
      const [currY, currW] = beobWochen[i].split("-W").map(Number);
      const istKonsekutiv = (currY === prevY && currW === prevW + 1) ||
        (currY === prevY + 1 && currW === 1 && prevW >= 52);
      if (istKonsekutiv) {
        aktuellerStreakW++;
      } else {
        maxStreakWochen = Math.max(maxStreakWochen, aktuellerStreakW);
        aktuellerStreakW = 1;
      }
    }
    maxStreakWochen = Math.max(maxStreakWochen, aktuellerStreakW);

    // Aktivste Wochentage
    const wochentage = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const wochentagDaten = wochentage.map((tag) => ({ tag, anzahl: 0 }));
    for (const b of beobachtungen) {
      const d = new Date(b.datum + "T00:00:00");
      wochentagDaten[d.getDay()].anzahl++;
    }

    // Artenvielfalt pro Beobachtung (Durchschnitt)
    const durchschnittArten =
      beobachtungen.length > 0
        ? beobachtungen.reduce((sum, b) => sum + b.vogelarten.length, 0) /
          beobachtungen.length
        : 0;

    // Produktivster Monat
    const produktivsterMonat = monateDaten.reduce(
      (max, m) => (m.anzahl > max.anzahl ? m : max),
      monateDaten[0]
    );

    // Aktuelle Wochen-Serie
    const aktuelleWoche = getISOWeek(heute);
    const letzteWoche = getISOWeek(new Date(heute.getTime() - 7 * 86400000));
    let aktuelleStreakWochen = 0;
    if (beobWochen.includes(aktuelleWoche) || beobWochen.includes(letzteWoche)) {
      const startW = beobWochen.includes(aktuelleWoche) ? aktuelleWoche : letzteWoche;
      aktuelleStreakWochen = 1;
      for (let i = beobWochen.indexOf(startW) - 1; i >= 0; i--) {
        const [prevY, prevW] = beobWochen[i].split("-W").map(Number);
        const [currY, currW] = beobWochen[i + 1].split("-W").map(Number);
        const istKonsekutiv = (currY === prevY && currW === prevW + 1) ||
          (currY === prevY + 1 && currW === 1 && prevW >= 52);
        if (istKonsekutiv) {
          aktuelleStreakWochen++;
        } else {
          break;
        }
      }
    }

    // Tage seit letzter Beobachtung
    const letztesBeobDatum = einzigartigeDaten[einzigartigeDaten.length - 1];
    const tageSeitLetzterBeob = letztesBeobDatum
      ? Math.max(
          0,
          Math.floor(
            (heute.getTime() - new Date(letztesBeobDatum + "T00:00:00").getTime()) /
              86400000
          )
        )
      : null;

    // Saison-Vergleich: Arten pro Jahreszeit dieses Jahr
    const saisonArten: Record<string, Set<string>> = {
      "Winter": new Set(),
      "Frühling": new Set(),
      "Sommer": new Set(),
      "Herbst": new Set(),
    };
    for (const b of beobDiesesJahr) {
      const monat = new Date(b.datum + "T00:00:00").getMonth();
      const saison = monat <= 1 || monat === 11 ? "Winter"
        : monat <= 4 ? "Frühling"
        : monat <= 7 ? "Sommer"
        : "Herbst";
      for (const art of b.vogelarten) saisonArten[saison].add(art);
    }
    const saisonDaten = [
      { saison: "Winter", icon: "❄️", arten: saisonArten["Winter"].size },
      { saison: "Frühling", icon: "🌸", arten: saisonArten["Frühling"].size },
      { saison: "Sommer", icon: "☀️", arten: saisonArten["Sommer"].size },
      { saison: "Herbst", icon: "🍂", arten: saisonArten["Herbst"].size },
    ];

    // Anzahl Saisons mit Beobachtungen (alle Jahre)
    const alleSaisons = new Set<string>();
    for (const b of beobachtungen) {
      const m = new Date(b.datum + "T00:00:00").getMonth();
      const s = m <= 1 || m === 11 ? "W" : m <= 4 ? "F" : m <= 7 ? "S" : "H";
      alleSaisons.add(s);
    }

    // --- Challenge-Daten berechnen ---

    // Tägliche Streak (für Challenge-Meilensteine)
    let maxStreakTage = 0;
    let aktStreakTage = 1;
    for (let i = 1; i < einzigartigeDaten.length; i++) {
      const prev = new Date(einzigartigeDaten[i - 1] + "T00:00:00");
      const curr = new Date(einzigartigeDaten[i] + "T00:00:00");
      const diff = (curr.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) {
        aktStreakTage++;
      } else {
        maxStreakTage = Math.max(maxStreakTage, aktStreakTage);
        aktStreakTage = 1;
      }
    }
    maxStreakTage = Math.max(maxStreakTage, aktStreakTage);

    // Eisvogel-Sichtungen
    const eisvogelName = "Eisvogel";
    const eisvogelSichtungen = beobachtungen.filter((b) =>
      b.vogelarten.some((a) => a.toLowerCase() === eisvogelName.toLowerCase())
    );
    const eisvogelOrte = new Set(eisvogelSichtungen.map((b) => b.ort));
    const eisvogelMonate = new Set(
      eisvogelSichtungen.map((b) => new Date(b.datum + "T00:00:00").getMonth())
    );

    // Max Arten in einer einzelnen Beobachtung
    const maxArtenEinBeob = Math.max(0, ...beobachtungen.map((b) => b.vogelarten.length));

    // Wochenend-Beobachtungen (Sa + So)
    const wochenendBeob = beobachtungen.filter((b) => {
      const d = new Date(b.datum + "T00:00:00").getDay();
      return d === 0 || d === 6;
    });

    // Frühaufsteher: Beobachtungen im Januar/Februar (Winterbeobachter)
    const winterBeob = beobachtungen.filter((b) => {
      const m = new Date(b.datum + "T00:00:00").getMonth();
      return m === 0 || m === 1 || m === 11;
    });

    // Verschiedene Monate mit Beobachtungen (alle 12?)
    const beobMonateSet = new Set(
      beobachtungen.map((b) => new Date(b.datum + "T00:00:00").getMonth())
    );

    // Artengruppen per Pattern-Matching (erkennt auch neue/unbekannte Arten)
    const artenLower = [...alleArten].map((a) => a.toLowerCase());

    function matcheGruppe(muster: string[]): string[] {
      return artenLower.filter((a) =>
        muster.some((m) => a.includes(m))
      );
    }

    // Greifvögel: Namensbestandteile + Einzelnamen
    const greifvogelMuster = ["adler", "bussard", "falke", "habicht", "milan", "weihe", "sperber"];
    const greifvogelEinzel = ["merlin"];
    const gesichteteGreifvoegel = [
      ...matcheGruppe(greifvogelMuster),
      ...artenLower.filter((a) => greifvogelEinzel.includes(a)),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    // Spechte: alles mit "specht" + Wendehals
    const spechtMuster = ["specht"];
    const spechtEinzel = ["wendehals"];
    const gesichteteSpechte = [
      ...matcheGruppe(spechtMuster),
      ...artenLower.filter((a) => spechtEinzel.includes(a)),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    // Eulen: alles mit "eule", "kauz", "uhu"
    const eulenMuster = ["eule", "kauz"];
    const eulenEinzel = ["uhu"];
    const gesichteteEulen = [
      ...matcheGruppe(eulenMuster),
      ...artenLower.filter((a) => eulenEinzel.includes(a)),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    // Wasservögel: Enten, Gänse, Schwäne, Taucher, Möwen, Reiher, etc.
    const wasservogelMuster = ["ente", "gans", "schwan", "taucher", "möwe", "reiher", "säger", "kormoran"];
    const wasservogelEinzel = ["blässhuhn", "teichhuhn", "wasseramsel"];
    const gesichteteWasservoegel = [
      ...matcheGruppe(wasservogelMuster),
      ...artenLower.filter((a) => wasservogelEinzel.includes(a)),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    // An einem Ort 5+ Arten in einer Beobachtung
    const reicheBeob = beobachtungen.filter((b) => b.vogelarten.length >= 5);

    // Gleicher Ort in verschiedenen Monaten (Treue)
    const ortMonate = new Map<string, Set<number>>();
    for (const b of beobachtungen) {
      const monat = new Date(b.datum + "T00:00:00").getMonth();
      const set = ortMonate.get(b.ort) ?? new Set();
      set.add(monat);
      ortMonate.set(b.ort, set);
    }
    const maxOrtMonate = Math.max(0, ...[...ortMonate.values()].map((s) => s.size));

    // Neujahrsbeobachtung (1. Januar)
    const neujahrBeob = beobachtungen.some((b) => b.datum.endsWith("-01-01"));

    // Meilenstein-System mit Tiers
    interface Meilenstein {
      id: string;
      name: string;
      beschreibung: string;
      icon: string;
      tier: "bronze" | "silber" | "gold" | "diamant" | "legendaer";
      bedingung: number;
      aktuell: number;
      erreicht: boolean;
      geheim?: boolean;
      tipp?: string;
    }

    const alleMeilensteine: Meilenstein[] = [
      // === Bronze ===
      { id: "b1", name: "Erster Blick", beschreibung: "Erste Beobachtung", icon: "👀", tier: "bronze", bedingung: 1, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 1 },
      { id: "b2", name: "Handvoll", beschreibung: "5 Vogelarten entdeckt", icon: "🖐️", tier: "bronze", bedingung: 5, aktuell: alleArten.size, erreicht: alleArten.size >= 5 },
      { id: "b3", name: "Stammgast", beschreibung: "10 Beobachtungen", icon: "📝", tier: "bronze", bedingung: 10, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 10 },
      { id: "b4", name: "Artenjäger", beschreibung: "10 Vogelarten entdeckt", icon: "🔍", tier: "bronze", bedingung: 10, aktuell: alleArten.size, erreicht: alleArten.size >= 10 },
      { id: "b5", name: "Entdecker", beschreibung: "3 verschiedene Orte", icon: "🗺️", tier: "bronze", bedingung: 3, aktuell: orte.size, erreicht: orte.size >= 3 },
      { id: "b6", name: "Wochenstart", beschreibung: "2 Wochen am Stück", icon: "📅", tier: "bronze", bedingung: 2, aktuell: maxStreakWochen, erreicht: maxStreakWochen >= 2 },
      { id: "b7", name: "Doppeltag", beschreibung: "2 Tage am Stück beobachten", icon: "📆", tier: "bronze", bedingung: 2, aktuell: maxStreakTage, erreicht: maxStreakTage >= 2 },
      { id: "b8", name: "Wochenende", beschreibung: "5 Wochenend-Beobachtungen", icon: "🌅", tier: "bronze", bedingung: 5, aktuell: wochenendBeob.length, erreicht: wochenendBeob.length >= 5 },

      // === Silber ===
      { id: "s1", name: "Kennerblick", beschreibung: "25 Vogelarten entdeckt", icon: "🦅", tier: "silber", bedingung: 25, aktuell: alleArten.size, erreicht: alleArten.size >= 25 },
      { id: "s2", name: "Routinier", beschreibung: "25 Beobachtungen", icon: "📋", tier: "silber", bedingung: 25, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 25 },
      { id: "s3", name: "Wandervogel", beschreibung: "5 verschiedene Orte", icon: "🥾", tier: "silber", bedingung: 5, aktuell: orte.size, erreicht: orte.size >= 5 },
      { id: "s4", name: "Grenzgänger", beschreibung: "2 Länder besucht", icon: "✈️", tier: "silber", bedingung: 2, aktuell: laender.size, erreicht: laender.size >= 2 },
      { id: "s5", name: "Monatsmarathon", beschreibung: "4 Wochen am Stück", icon: "🔥", tier: "silber", bedingung: 4, aktuell: maxStreakWochen, erreicht: maxStreakWochen >= 4 },
      { id: "s6", name: "Fleißig", beschreibung: "50 Beobachtungen", icon: "⭐", tier: "silber", bedingung: 50, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 50 },
      { id: "s7", name: "Jahreszeiten", beschreibung: "In allen 4 Saisons beobachtet", icon: "🌍", tier: "silber", bedingung: 4, aktuell: alleSaisons.size, erreicht: alleSaisons.size >= 4 },
      { id: "s8", name: "Dreitageswanderung", beschreibung: "3 Tage am Stück beobachten", icon: "🥾", tier: "silber", bedingung: 3, aktuell: maxStreakTage, erreicht: maxStreakTage >= 3 },
      { id: "s9", name: "Artenreichtum", beschreibung: "5+ Arten in einer Beobachtung", icon: "🌿", tier: "silber", bedingung: 5, aktuell: maxArtenEinBeob, erreicht: maxArtenEinBeob >= 5 },
      { id: "s10", name: "Wasserfreund", beschreibung: "5 Wasservogelarten entdeckt", icon: "🦆", tier: "silber", bedingung: 5, aktuell: gesichteteWasservoegel.length, erreicht: gesichteteWasservoegel.length >= 5 },

      // === Gold ===
      { id: "g1", name: "Ornithologe", beschreibung: "50 Vogelarten entdeckt", icon: "🏅", tier: "gold", bedingung: 50, aktuell: alleArten.size, erreicht: alleArten.size >= 50 },
      { id: "g2", name: "Tagebuch-Profi", beschreibung: "100 Beobachtungen", icon: "📖", tier: "gold", bedingung: 100, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 100 },
      { id: "g3", name: "Reisender", beschreibung: "10 verschiedene Orte", icon: "🧭", tier: "gold", bedingung: 10, aktuell: orte.size, erreicht: orte.size >= 10 },
      { id: "g4", name: "Kosmopolit", beschreibung: "3 Länder besucht", icon: "🌐", tier: "gold", bedingung: 3, aktuell: laender.size, erreicht: laender.size >= 3 },
      { id: "g5", name: "Quartalsjäger", beschreibung: "8 Wochen am Stück", icon: "💎", tier: "gold", bedingung: 8, aktuell: maxStreakWochen, erreicht: maxStreakWochen >= 8 },
      { id: "g6", name: "Artensammler", beschreibung: "75 Vogelarten entdeckt", icon: "🦉", tier: "gold", bedingung: 75, aktuell: alleArten.size, erreicht: alleArten.size >= 75 },
      { id: "g7", name: "Kartograph", beschreibung: "15 verschiedene Orte", icon: "📌", tier: "gold", bedingung: 15, aktuell: orte.size, erreicht: orte.size >= 15 },
      { id: "g8", name: "Intensivwoche", beschreibung: "5 Tage am Stück beobachten", icon: "🗓️", tier: "gold", bedingung: 5, aktuell: maxStreakTage, erreicht: maxStreakTage >= 5 },
      { id: "g9", name: "Spechtologe", beschreibung: "3 Spechtarten entdeckt", icon: "🪶", tier: "gold", bedingung: 3, aktuell: gesichteteSpechte.length, erreicht: gesichteteSpechte.length >= 3 },
      { id: "g10", name: "Stammplatz", beschreibung: "Einen Ort in 6 verschiedenen Monaten besucht", icon: "🏠", tier: "gold", bedingung: 6, aktuell: maxOrtMonate, erreicht: maxOrtMonate >= 6 },
      { id: "g11", name: "Falknerauge", beschreibung: "3 Greifvogelarten entdeckt", icon: "🦅", tier: "gold", bedingung: 3, aktuell: gesichteteGreifvoegel.length, erreicht: gesichteteGreifvoegel.length >= 3 },
      { id: "g12", name: "Ganzjährig", beschreibung: "In allen 12 Monaten beobachtet", icon: "📊", tier: "gold", bedingung: 12, aktuell: beobMonateSet.size, erreicht: beobMonateSet.size >= 12 },
      { id: "g13", name: "Vielfalt", beschreibung: "8+ Arten in einer Beobachtung", icon: "🌈", tier: "gold", bedingung: 8, aktuell: maxArtenEinBeob, erreicht: maxArtenEinBeob >= 8 },

      // === Diamant ===
      { id: "d1", name: "Centurion", beschreibung: "100 Vogelarten entdeckt", icon: "💯", tier: "diamant", bedingung: 100, aktuell: alleArten.size, erreicht: alleArten.size >= 100 },
      { id: "d2", name: "Chronist", beschreibung: "200 Beobachtungen", icon: "📚", tier: "diamant", bedingung: 200, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 200 },
      { id: "d3", name: "Globetrotter", beschreibung: "25 verschiedene Orte", icon: "🌎", tier: "diamant", bedingung: 25, aktuell: orte.size, erreicht: orte.size >= 25 },
      { id: "d4", name: "Weltenbummler", beschreibung: "5 Länder besucht", icon: "🗺️", tier: "diamant", bedingung: 5, aktuell: laender.size, erreicht: laender.size >= 5 },
      { id: "d5", name: "Halbjahreslauf", beschreibung: "12 Wochen am Stück", icon: "🏆", tier: "diamant", bedingung: 12, aktuell: maxStreakWochen, erreicht: maxStreakWochen >= 12 },
      { id: "d6", name: "Meisterbeobachter", beschreibung: "150 Vogelarten entdeckt", icon: "🔭", tier: "diamant", bedingung: 150, aktuell: alleArten.size, erreicht: alleArten.size >= 150 },
      { id: "d7", name: "Marathonwoche", beschreibung: "7 Tage am Stück beobachten", icon: "🏃", tier: "diamant", bedingung: 7, aktuell: maxStreakTage, erreicht: maxStreakTage >= 7 },
      { id: "d8", name: "Greifvogel-Experte", beschreibung: "6 Greifvogelarten entdeckt", icon: "🦅", tier: "diamant", bedingung: 6, aktuell: gesichteteGreifvoegel.length, erreicht: gesichteteGreifvoegel.length >= 6 },
      { id: "d9", name: "Seenplatte", beschreibung: "10 Wasservogelarten entdeckt", icon: "🏞️", tier: "diamant", bedingung: 10, aktuell: gesichteteWasservoegel.length, erreicht: gesichteteWasservoegel.length >= 10 },
      { id: "d10", name: "Heimatort", beschreibung: "Einen Ort in 10 verschiedenen Monaten besucht", icon: "💚", tier: "diamant", bedingung: 10, aktuell: maxOrtMonate, erreicht: maxOrtMonate >= 10 },
      { id: "d11", name: "Artenexplosion", beschreibung: "12+ Arten in einer Beobachtung", icon: "💥", tier: "diamant", bedingung: 12, aktuell: maxArtenEinBeob, erreicht: maxArtenEinBeob >= 12 },

      // === Legendär ===
      { id: "l1", name: "Legende", beschreibung: "200 Vogelarten entdeckt", icon: "👑", tier: "legendaer", bedingung: 200, aktuell: alleArten.size, erreicht: alleArten.size >= 200 },
      { id: "l2", name: "Enzyklopädie", beschreibung: "500 Beobachtungen", icon: "🏛️", tier: "legendaer", bedingung: 500, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 500 },
      { id: "l3", name: "Nomade", beschreibung: "50 verschiedene Orte", icon: "⛰️", tier: "legendaer", bedingung: 50, aktuell: orte.size, erreicht: orte.size >= 50 },
      { id: "l4", name: "Jahreslauf", beschreibung: "26 Wochen am Stück", icon: "🌟", tier: "legendaer", bedingung: 26, aktuell: maxStreakWochen, erreicht: maxStreakWochen >= 26 },
      { id: "l5", name: "Unsterblich", beschreibung: "1000 Beobachtungen", icon: "🔱", tier: "legendaer", bedingung: 1000, aktuell: beobachtungen.length, erreicht: beobachtungen.length >= 1000 },
      { id: "l6", name: "Zwei-Wochen-Expedition", beschreibung: "14 Tage am Stück beobachten", icon: "⛺", tier: "legendaer", bedingung: 14, aktuell: maxStreakTage, erreicht: maxStreakTage >= 14 },

      // === Geheim ===
      { id: "x1", name: "Eisvogel-Jäger", beschreibung: "Ersten Eisvogel gesichtet", icon: "💎", tier: "silber", bedingung: 1, aktuell: eisvogelSichtungen.length, erreicht: eisvogelSichtungen.length >= 1, geheim: true, tipp: "Der fliegende Edelstein wartet an ruhigen Gewässern..." },
      { id: "x2", name: "Eisvogel-Kenner", beschreibung: "Eisvogel an 3 Orten gesichtet", icon: "💎", tier: "gold", bedingung: 3, aktuell: eisvogelOrte.size, erreicht: eisvogelOrte.size >= 3, geheim: true, tipp: "Suche den Edelstein an verschiedenen Ufern" },
      { id: "x3", name: "Eisvogel-Meister", beschreibung: "Eisvogel in 4 Jahreszeiten gesichtet", icon: "💎", tier: "diamant", bedingung: 4, aktuell: eisvogelMonate.size >= 3 ? Math.min(eisvogelMonate.size, 4) : eisvogelMonate.size, erreicht: eisvogelMonate.size >= 4, geheim: true, tipp: "Folge dem Edelstein durch alle Jahreszeiten" },
      { id: "x4", name: "Eisvogel-Legende", beschreibung: "Eisvogel 10× gesichtet", icon: "👑", tier: "legendaer", bedingung: 10, aktuell: eisvogelSichtungen.length, erreicht: eisvogelSichtungen.length >= 10, geheim: true, tipp: "Der Edelstein hat dich akzeptiert" },
      { id: "x5", name: "Neujahrs-Birder", beschreibung: "Beobachtung am 1. Januar", icon: "🎆", tier: "gold", bedingung: 1, aktuell: neujahrBeob ? 1 : 0, erreicht: neujahrBeob, geheim: true, tipp: "Starte das Jahr mit Vogelgesang" },
      { id: "x6", name: "Winterhart", beschreibung: "15 Winterbeobachtungen (Dez-Feb)", icon: "🥶", tier: "gold", bedingung: 15, aktuell: winterBeob.length, erreicht: winterBeob.length >= 15, geheim: true, tipp: "Auch in der kalten Jahreszeit gibt es viel zu sehen" },
      { id: "x7", name: "Nachtaktiv", beschreibung: "Eine Eulenart entdeckt", icon: "🦉", tier: "silber", bedingung: 1, aktuell: gesichteteEulen.length, erreicht: gesichteteEulen.length >= 1, geheim: true, tipp: "Manche Vögel zeigen sich erst in der Dämmerung" },
      { id: "x8", name: "Eulenflüsterer", beschreibung: "3 Eulenarten entdeckt", icon: "🌙", tier: "diamant", bedingung: 3, aktuell: gesichteteEulen.length, erreicht: gesichteteEulen.length >= 3, geheim: true, tipp: "Schuhuu... wer ruft da im Wald?" },
      { id: "x9", name: "Safari", beschreibung: "10 Beobachtungen mit 5+ Arten", icon: "🌄", tier: "gold", bedingung: 10, aktuell: reicheBeob.length, erreicht: reicheBeob.length >= 10, geheim: true, tipp: "Suche Orte mit besonders vielen verschiedenen Arten" },
      { id: "x10", name: "Wochenendkrieger", beschreibung: "20 Wochenend-Beobachtungen", icon: "⚔️", tier: "gold", bedingung: 20, aktuell: wochenendBeob.length, erreicht: wochenendBeob.length >= 20, geheim: true, tipp: "Nutze jedes freie Wochenende für die Natur" },
    ];

    // Seltenste Arten (nur 1x gesehen)
    const selten = [...artHaeufigkeit.entries()]
      .filter(([, count]) => count === 1)
      .map(([name]) => name)
      .sort();

    // Monatliche Neuentdeckungen dieses Jahr
    const neuentdeckungenProMonat: { monat: string; anzahl: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(diesesJahr, m, 1);
      const key = `${diesesJahr}-${String(m + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("de-DE", { month: "short" });
      const count = [...ersteSichtung.entries()].filter(
        ([, datum]) => datum.startsWith(key)
      ).length;
      neuentdeckungenProMonat.push({ monat: label, anzahl: count });
    }

    return {
      gesamtArten: alleArten.size,
      gesamtBeobachtungen: beobachtungen.length,
      gesamtOrte: orte.size,
      gesamtLaender: laender.size,
      artenDiesesJahr: artenDiesesJahr.size,
      neueArtenDiesesJahr,
      beobDiesesJahr: beobDiesesJahr.length,
      tageSeitNeuentdeckung,
      letzteNeuentdeckung,
      monateDaten,
      kumulativ,
      topArten,
      topOrte,
      maxStreakWochen,
      aktuelleStreakWochen,
      tageSeitLetzterBeob,
      wochentagDaten,
      durchschnittArten,
      produktivsterMonat,
      laender: [...laender],
      saisonDaten,
      alleMeilensteine,
      selten,
      neuentdeckungenProMonat,
    };
  }, [beobachtungen]);

  function handleExcelExport() {
    const zeilen = beobachtungen
      .sort((a, b) => b.datum.localeCompare(a.datum))
      .map((b) => ({
        Datum: b.datum,
        Ort: b.ort,
        Land: b.land,
        Vogelarten: b.vogelarten.join(", "),
        "Anzahl Arten": b.vogelarten.length,
      }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(zeilen);

    // Spaltenbreiten
    ws["!cols"] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 6 },
      { wch: 50 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Beobachtungen");

    // Zweites Sheet: Artenliste
    const artenSet = new Map<string, { erstmals: string; anzahl: number }>();
    for (const b of beobachtungen) {
      for (const art of b.vogelarten) {
        const existing = artenSet.get(art);
        if (!existing) {
          artenSet.set(art, { erstmals: b.datum, anzahl: 1 });
        } else {
          existing.anzahl++;
          if (b.datum < existing.erstmals) existing.erstmals = b.datum;
        }
      }
    }
    const artenZeilen = [...artenSet.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, info]) => ({
        Vogelart: name,
        "Erstmals gesehen": info.erstmals,
        "Anzahl Beobachtungen": info.anzahl,
      }));
    const ws2 = XLSX.utils.json_to_sheet(artenZeilen);
    ws2["!cols"] = [{ wch: 25 }, { wch: 16 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Artenliste");

    XLSX.writeFile(
      wb,
      `Vogeltagebuch_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  }

  if (laden) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <p className="text-stone-500">Lade Daten...</p>
      </div>
    );
  }

  if (!stats || beobachtungen.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <p className="text-stone-500">
          Noch keine Beobachtungen vorhanden. Starte mit deiner ersten
          Beobachtung!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={handleExcelExport}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 transition-colors text-sm"
        >
          <span>📊</span> Excel-Export
        </button>
      </div>

      {/* Hauptkennzahlen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatKarte
          label="Vogelarten"
          wert={stats.gesamtArten}
          icon="🐦"
          farbe="emerald"
        />
        <StatKarte
          label="Beobachtungen"
          wert={stats.gesamtBeobachtungen}
          icon="📋"
          farbe="sky"
        />
        <StatKarte
          label="Orte"
          wert={stats.gesamtOrte}
          icon="📍"
          farbe="amber"
        />
        <StatKarte
          label="Länder"
          wert={stats.gesamtLaender}
          icon="🌍"
          farbe="violet"
          untertitel={stats.laender.sort().join(", ")}
        />
      </div>

      {/* Motivations-Banner */}
      <MotivationsBanner
        tageSeitLetzterBeob={stats.tageSeitLetzterBeob}
        aktuelleStreakWochen={stats.aktuelleStreakWochen}
        tageSeitNeuentdeckung={stats.tageSeitNeuentdeckung}
        neueArtenDiesesJahr={stats.neueArtenDiesesJahr}
      />

      {/* Highlights-Leiste */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-4 text-white shadow-lg">
          <p className="text-emerald-100 text-[10px] uppercase tracking-wide mb-1">
            Dieses Jahr
          </p>
          <p className="text-2xl font-bold">{stats.neueArtenDiesesJahr}</p>
          <p className="text-emerald-100 text-xs">
            neue Arten
          </p>
          <p className="text-emerald-200 text-[10px] mt-1">
            {stats.beobDiesesJahr} Beobachtungen
          </p>
        </div>

        <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
          <p className="text-sky-100 text-[10px] uppercase tracking-wide mb-1">
            Neuentdeckung
          </p>
          <p className="text-2xl font-bold">
            {stats.tageSeitNeuentdeckung !== null
              ? stats.tageSeitNeuentdeckung === 0
                ? "Heute!"
                : `${stats.tageSeitNeuentdeckung}d`
              : "–"}
          </p>
          <p className="text-sky-100 text-xs">seit neuer Art</p>
          {stats.letzteNeuentdeckung && (
            <p className="text-sky-200 text-[10px] mt-1">
              am{" "}
              {new Date(
                stats.letzteNeuentdeckung + "T00:00:00"
              ).toLocaleDateString("de-DE", {
                day: "numeric",
                month: "short",
              })}
            </p>
          )}
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
          <p className="text-amber-100 text-[10px] uppercase tracking-wide mb-1">
            Wochen-Serie
          </p>
          <p className="text-2xl font-bold">
            {stats.aktuelleStreakWochen > 0
              ? `${stats.aktuelleStreakWochen}W 🔥`
              : "0W"}
          </p>
          <p className="text-amber-100 text-xs">
            {stats.aktuelleStreakWochen > 0 ? "am Laufen!" : "Starte diese Woche!"}
          </p>
          <p className="text-amber-200 text-[10px] mt-1">
            Rekord: {stats.maxStreakWochen} Wochen
          </p>
        </div>

        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
          <p className="text-violet-100 text-[10px] uppercase tracking-wide mb-1">
            Letzte Beobachtung
          </p>
          <p className="text-2xl font-bold">
            {stats.tageSeitLetzterBeob !== null
              ? stats.tageSeitLetzterBeob === 0
                ? "Heute"
                : `${stats.tageSeitLetzterBeob}d`
              : "–"}
          </p>
          <p className="text-violet-100 text-xs">
            ∅ {stats.durchschnittArten.toFixed(1)} Arten/Beob.
          </p>
        </div>
      </div>

      {/* Charts Zeile 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Beobachtungen pro Monat */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 mb-4">
            Beobachtungen pro Monat
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.monateDaten}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis
                dataKey="monat"
                tick={{ fontSize: 11, fill: "#78716c" }}
                axisLine={{ stroke: "#d6d3d1" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#78716c" }}
                axisLine={{ stroke: "#d6d3d1" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e7e5e4",
                  fontSize: "13px",
                }}
                formatter={(value) => [String(value), "Beobachtungen"]}
              />
              <Bar
                dataKey="anzahl"
                fill="#059669"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Kumulative Artenentdeckung */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 mb-4">
            Artenentdeckung kumulativ
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.kumulativ}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis
                dataKey="datum"
                tick={{ fontSize: 11, fill: "#78716c" }}
                axisLine={{ stroke: "#d6d3d1" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#78716c" }}
                axisLine={{ stroke: "#d6d3d1" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e7e5e4",
                  fontSize: "13px",
                }}
                formatter={(value) => [String(value), "Arten gesamt"]}
              />
              <Line
                type="monotone"
                dataKey="arten"
                stroke="#0284c7"
                strokeWidth={2.5}
                dot={{ fill: "#0284c7", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Zeile 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Vogelarten */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 mb-4">
            Top 10 Vogelarten
          </h2>
          <div className="space-y-2">
            {stats.topArten.map((art, i) => {
              const maxAnzahl = stats.topArten[0].anzahl;
              const prozent = (art.anzahl / maxAnzahl) * 100;
              return (
                <div key={art.name} className="flex items-center gap-3">
                  <span className="text-xs text-stone-400 w-4 text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-stone-700 truncate">
                        {art.name}
                      </span>
                      <span className="text-xs text-stone-500 ml-2 shrink-0">
                        {art.anzahl}×
                      </span>
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${prozent}%`,
                          backgroundColor: FARBEN[i % FARBEN.length],
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Orte als Pie Chart */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 mb-4">
            Beliebteste Orte
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={stats.topOrte}
                dataKey="anzahl"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={40}
                paddingAngle={3}
                label={({ name, percent }) =>
                  `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
                labelLine={{ stroke: "#a8a29e", strokeWidth: 1 }}
              >
                {stats.topOrte.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={FARBEN[i % FARBEN.length]}
                    stroke="white"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e7e5e4",
                  fontSize: "13px",
                }}
                formatter={(value) => [String(value), "Beobachtungen"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Wochentags-Aktivität */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-stone-800 mb-4">
          Aktivität nach Wochentag
        </h2>
        <div className="flex items-end justify-around gap-2" style={{ height: "140px" }}>
          {stats.wochentagDaten.map((w) => {
            const max = Math.max(...stats.wochentagDaten.map((d) => d.anzahl));
            const hoehe = max > 0 ? (w.anzahl / max) * 100 : 0;
            return (
              <div key={w.tag} className="flex flex-col items-center gap-1 flex-1 h-full justify-end">
                <span className="text-xs text-stone-500 font-medium">{w.anzahl}</span>
                <div
                  className="w-full max-w-[40px] bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t-md"
                  style={{ height: `${Math.max(hoehe, 3)}%`, minHeight: w.anzahl > 0 ? "6px" : "2px" }}
                />
                <span className="text-xs font-medium text-stone-600">
                  {w.tag}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Neuentdeckungen dieses Jahr + Saison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Neuentdeckungen pro Monat */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 mb-4">
            Neuentdeckungen {new Date().getFullYear()}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.neuentdeckungenProMonat}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis
                dataKey="monat"
                tick={{ fontSize: 11, fill: "#78716c" }}
                axisLine={{ stroke: "#d6d3d1" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#78716c" }}
                axisLine={{ stroke: "#d6d3d1" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e7e5e4",
                  fontSize: "13px",
                }}
                formatter={(value) => [String(value), "Neue Arten"]}
              />
              <Bar
                dataKey="anzahl"
                fill="#7c3aed"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Saison-Vergleich */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 mb-4">
            Arten pro Jahreszeit {new Date().getFullYear()}
          </h2>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {stats.saisonDaten.map((s) => {
              const maxSaison = Math.max(
                ...stats.saisonDaten.map((d) => d.arten),
                1
              );
              const prozent = (s.arten / maxSaison) * 100;
              return (
                <div
                  key={s.saison}
                  className="bg-stone-50 rounded-lg p-4 text-center"
                >
                  <p className="text-2xl mb-1">{s.icon}</p>
                  <p className="text-2xl font-bold text-stone-800">
                    {s.arten}
                  </p>
                  <p className="text-xs text-stone-500 mb-2">{s.saison}</p>
                  <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${prozent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Meilensteine */}
      <MeilensteinSektion meilensteine={stats.alleMeilensteine} />

      {/* Seltenheiten */}
      {stats.selten.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-stone-800 mb-1">
            Seltenheiten — nur 1× gesehen
          </h2>
          <p className="text-xs text-stone-400 mb-3">
            Halte Ausschau nach diesen Arten und bestätige deine Sichtung!
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.selten.map((art) => (
              <span
                key={art}
                className="bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full text-sm"
              >
                ⭐ {art}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Produktivster Monat */}
      {stats.produktivsterMonat && stats.produktivsterMonat.anzahl > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-center text-sm text-stone-600">
          Dein produktivster Monat war{" "}
          <span className="font-semibold text-emerald-700">
            {stats.produktivsterMonat.monat}
          </span>{" "}
          mit{" "}
          <span className="font-semibold text-emerald-700">
            {stats.produktivsterMonat.anzahl} Beobachtungen
          </span>
          .
        </div>
      )}
    </div>
  );
}

function MotivationsBanner({
  tageSeitLetzterBeob,
  aktuelleStreakWochen,
  tageSeitNeuentdeckung,
  neueArtenDiesesJahr,
}: {
  tageSeitLetzterBeob: number | null;
  aktuelleStreakWochen: number;
  tageSeitNeuentdeckung: number | null;
  neueArtenDiesesJahr: number;
}) {
  let nachricht = "";
  let icon = "";
  let gradient = "";

  if (tageSeitLetzterBeob === 0) {
    if (aktuelleStreakWochen >= 3) {
      nachricht = `${aktuelleStreakWochen} Wochen in Folge — du bist on fire! Kannst du den Rekord knacken?`;
      icon = "🔥";
      gradient = "from-orange-500 to-red-500";
    } else {
      nachricht = "Stark! Du warst heute schon draußen. Weiter so!";
      icon = "💪";
      gradient = "from-emerald-500 to-green-600";
    }
  } else if (tageSeitLetzterBeob !== null && tageSeitLetzterBeob <= 2) {
    nachricht = "Perfektes Wetter für eine Runde Vogelbeobachtung?";
    icon = "🌤️";
    gradient = "from-sky-400 to-blue-500";
  } else if (tageSeitLetzterBeob !== null && tageSeitLetzterBeob <= 7) {
    nachricht = `Schon ${tageSeitLetzterBeob} Tage her — die Vögel vermissen dich!`;
    icon = "🐦";
    gradient = "from-amber-400 to-orange-500";
  } else {
    nachricht = "Zeit für ein Comeback! Da draußen warten neue Entdeckungen.";
    icon = "🌅";
    gradient = "from-purple-500 to-pink-500";
  }

  if (tageSeitNeuentdeckung === 0) {
    nachricht = "Glückwunsch zur neuen Art! Wer weiß was du noch findest?";
    icon = "🎉";
    gradient = "from-emerald-400 to-teal-500";
  }

  return (
    <div
      className={`bg-gradient-to-r ${gradient} rounded-xl p-4 text-white shadow-lg flex items-center gap-3`}
    >
      <span className="text-3xl shrink-0">{icon}</span>
      <div>
        <p className="font-medium text-sm">{nachricht}</p>
        {neueArtenDiesesJahr > 0 && (
          <p className="text-white/70 text-xs mt-0.5">
            {neueArtenDiesesJahr} neue Arten in {new Date().getFullYear()} entdeckt
          </p>
        )}
      </div>
    </div>
  );
}

interface MeilensteinTyp {
  id: string;
  name: string;
  beschreibung: string;
  icon: string;
  tier: "bronze" | "silber" | "gold" | "diamant" | "legendaer";
  bedingung: number;
  aktuell: number;
  erreicht: boolean;
  geheim?: boolean;
  tipp?: string;
}

const TIER_CONFIG = {
  bronze: { label: "Bronze", farbe: "from-amber-600 to-amber-700", bg: "bg-amber-50 border-amber-200", text: "text-amber-700", ring: "ring-amber-300" },
  silber: { label: "Silber", farbe: "from-slate-400 to-slate-500", bg: "bg-slate-50 border-slate-200", text: "text-slate-600", ring: "ring-slate-300" },
  gold: { label: "Gold", farbe: "from-yellow-400 to-yellow-500", bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", ring: "ring-yellow-300" },
  diamant: { label: "Diamant", farbe: "from-cyan-400 to-blue-500", bg: "bg-cyan-50 border-cyan-200", text: "text-cyan-700", ring: "ring-cyan-300" },
  legendaer: { label: "Legendär", farbe: "from-purple-500 to-pink-500", bg: "bg-purple-50 border-purple-200", text: "text-purple-700", ring: "ring-purple-300" },
};

const TIER_ORDER: Array<"bronze" | "silber" | "gold" | "diamant" | "legendaer"> = ["bronze", "silber", "gold", "diamant", "legendaer"];

function MeilensteinSektion({ meilensteine }: { meilensteine: MeilensteinTyp[] }) {
  const [tab, setTab] = useState<"alle" | "erreicht" | "offen" | "geheim">("alle");

  const normale = meilensteine.filter((m) => !m.geheim);
  const geheime = meilensteine.filter((m) => m.geheim);
  const erreichte = normale.filter((m) => m.erreicht);
  const offene = normale.filter((m) => !m.erreicht);
  const geheimerreicht = geheime.filter((m) => m.erreicht);
  const naechste = offene
    .map((m) => ({ ...m, fortschritt: m.aktuell / m.bedingung }))
    .sort((a, b) => b.fortschritt - a.fortschritt)
    .slice(0, 3);

  const anzeigeListe = tab === "erreicht" ? erreichte
    : tab === "offen" ? offene
    : tab === "geheim" ? geheime
    : normale;

  // Nach Tier gruppieren
  const gruppiert = TIER_ORDER.map((tier) => ({
    tier,
    config: TIER_CONFIG[tier],
    items: anzeigeListe.filter((m) => m.tier === tier),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-stone-800">Meilensteine</h2>
        <span className="text-sm text-emerald-600 font-medium">
          {erreichte.length + geheimerreicht.length} / {meilensteine.length}
        </span>
      </div>

      {/* Gesamt-Fortschritt */}
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
          style={{ width: `${((erreichte.length + geheimerreicht.length) / meilensteine.length) * 100}%` }}
        />
      </div>

      {/* Nächste Meilensteine Highlight */}
      {naechste.length > 0 && tab === "alle" && (
        <div className="mb-4">
          <p className="text-xs text-stone-400 uppercase tracking-wide mb-2">Fast geschafft</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {naechste.map((m) => {
              const prozent = Math.min(Math.round(m.fortschritt * 100), 99);
              const cfg = TIER_CONFIG[m.tier];
              return (
                <div key={m.id} className={`${cfg.bg} border rounded-lg p-3`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{m.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${cfg.text} truncate`}>{m.name}</p>
                      <p className="text-[10px] text-stone-400">{m.beschreibung}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${cfg.farbe}`}
                      style={{ width: `${prozent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1">
                    {m.aktuell} / {m.bedingung} ({prozent}%)
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {([
          { key: "alle" as const, label: `Alle (${normale.length})` },
          { key: "erreicht" as const, label: `Erreicht (${erreichte.length})` },
          { key: "offen" as const, label: `Offen (${offene.length})` },
          { key: "geheim" as const, label: `Geheim (${geheimerreicht.length}/${geheime.length})` },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Meilensteine nach Tier */}
      <div className="space-y-4">
        {gruppiert.map(({ tier, config, items }) => (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-3 w-3 rounded-full bg-gradient-to-r ${config.farbe}`} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${config.text}`}>
                {config.label}
              </span>
              <span className="text-[10px] text-stone-400">
                {items.filter((m) => m.erreicht).length} / {items.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {items.map((m) => {
                const prozent = Math.min(Math.round((m.aktuell / m.bedingung) * 100), 100);
                const istGeheimVersteckt = m.geheim && !m.erreicht;
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg p-2.5 border text-center transition-all ${
                      m.erreicht
                        ? `${config.bg} ring-1 ${config.ring}`
                        : istGeheimVersteckt
                          ? "bg-stone-100 border-stone-200 border-dashed"
                          : "bg-stone-50 border-stone-150 opacity-60"
                    }`}
                  >
                    <span className={`text-xl ${m.erreicht ? "" : istGeheimVersteckt ? "grayscale" : "grayscale opacity-50"}`}>
                      {istGeheimVersteckt ? "❓" : m.icon}
                    </span>
                    <p className={`text-xs font-medium mt-1 ${m.erreicht ? config.text : "text-stone-400"}`}>
                      {istGeheimVersteckt ? "???" : m.name}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5 leading-tight italic">
                      {istGeheimVersteckt
                        ? (m.tipp ?? "Weiter beobachten...")
                        : m.beschreibung}
                    </p>
                    {!m.erreicht && !istGeheimVersteckt && (
                      <div className="mt-1.5">
                        <div className="h-1 bg-stone-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${config.farbe}`}
                            style={{ width: `${prozent}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-stone-400 mt-0.5">
                          {m.aktuell}/{m.bedingung}
                        </p>
                      </div>
                    )}
                    {m.erreicht && (
                      <p className="text-[10px] text-emerald-500 font-medium mt-1">✓</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatKarte({
  label,
  wert,
  icon,
  farbe,
  untertitel,
}: {
  label: string;
  wert: number;
  icon: string;
  farbe: "emerald" | "sky" | "amber" | "violet";
  untertitel?: string;
}) {
  const bgKlassen = {
    emerald: "bg-emerald-50 border-emerald-200",
    sky: "bg-sky-50 border-sky-200",
    amber: "bg-amber-50 border-amber-200",
    violet: "bg-violet-50 border-violet-200",
  };
  const textKlassen = {
    emerald: "text-emerald-700",
    sky: "text-sky-700",
    amber: "text-amber-700",
    violet: "text-violet-700",
  };

  return (
    <div
      className={`${bgKlassen[farbe]} border rounded-xl p-4 text-center shadow-sm`}
    >
      <p className="text-2xl mb-1">{icon}</p>
      <p className={`text-2xl font-bold ${textKlassen[farbe]}`}>{wert}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {untertitel && (
        <p className="text-xs text-stone-400 mt-1">{untertitel}</p>
      )}
    </div>
  );
}
