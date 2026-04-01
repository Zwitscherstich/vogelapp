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

    // Längste Beobachtungs-Serie (Tage in Folge)
    const einzigartigeDaten = [...new Set(beobachtungen.map((b) => b.datum))].sort();
    let maxStreak = 0;
    let aktuellerStreak = 1;
    for (let i = 1; i < einzigartigeDaten.length; i++) {
      const prev = new Date(einzigartigeDaten[i - 1]);
      const curr = new Date(einzigartigeDaten[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        aktuellerStreak++;
      } else {
        maxStreak = Math.max(maxStreak, aktuellerStreak);
        aktuellerStreak = 1;
      }
    }
    maxStreak = Math.max(maxStreak, aktuellerStreak);

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
      maxStreak,
      wochentagDaten,
      durchschnittArten,
      produktivsterMonat,
      laender: [...laender],
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

      {/* Highlights-Leiste */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white shadow-lg">
          <p className="text-emerald-100 text-xs uppercase tracking-wide mb-1">
            Dieses Jahr
          </p>
          <p className="text-3xl font-bold">{stats.neueArtenDiesesJahr}</p>
          <p className="text-emerald-100 text-sm">
            neue Arten entdeckt
          </p>
          <p className="text-emerald-200 text-xs mt-2">
            {stats.beobDiesesJahr} Beobachtungen in {new Date().getFullYear()}
          </p>
        </div>

        <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl p-5 text-white shadow-lg">
          <p className="text-sky-100 text-xs uppercase tracking-wide mb-1">
            Neuentdeckung
          </p>
          <p className="text-3xl font-bold">
            {stats.tageSeitNeuentdeckung !== null
              ? stats.tageSeitNeuentdeckung === 0
                ? "Heute!"
                : `${stats.tageSeitNeuentdeckung} Tage`
              : "–"}
          </p>
          <p className="text-sky-100 text-sm">seit letzter neuer Art</p>
          {stats.letzteNeuentdeckung && (
            <p className="text-sky-200 text-xs mt-2">
              am{" "}
              {new Date(
                stats.letzteNeuentdeckung + "T00:00:00"
              ).toLocaleDateString("de-DE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 text-white shadow-lg">
          <p className="text-amber-100 text-xs uppercase tracking-wide mb-1">
            Rekorde
          </p>
          <p className="text-3xl font-bold">{stats.maxStreak} Tage</p>
          <p className="text-amber-100 text-sm">längste Serie</p>
          <p className="text-amber-200 text-xs mt-2">
            ∅ {stats.durchschnittArten.toFixed(1)} Arten pro Beobachtung
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
