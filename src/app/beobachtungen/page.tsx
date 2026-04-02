"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import BeobachtungBearbeiten from "@/components/BeobachtungBearbeiten";
import ExcelImport from "@/components/ExcelImport";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

interface Beobachtung {
  id: number;
  datum: string;
  ort: string;
  land: string;
  vogelarten: string[];
  fotos: string[];
}

export default function BeobachtungenPage() {
  const online = useOnlineStatus();
  const [beobachtungen, setBeobachtungen] = useState<Beobachtung[]>([]);
  const [laden, setLaden] = useState(true);
  const [ansicht, setAnsicht] = useState<"datum" | "ort" | "vogelart">(
    "datum"
  );
  const [suchbegriff, setSuchbegriff] = useState("");
  const [grossesBild, setGrossesBild] = useState<string | null>(null);
  const [bearbeitenId, setBearbeitenId] = useState<number | null>(null);
  const [loeschenId, setLoeschenId] = useState<number | null>(null);
  const [exportiert, setExportiert] = useState<number | null>(null);

  const ladeBeobachtungen = useCallback(async () => {
    // Alle drei Abfragen parallel statt N+1 Einzelabfragen
    const [beobResult, artenResult, fotosResult] = await Promise.all([
      supabase
        .from("beobachtungen")
        .select("id, datum, ort, land")
        .order("datum", { ascending: false }),
      supabase
        .from("beobachtung_vogelarten")
        .select("beobachtung_id, vogelarten(name)"),
      supabase
        .from("fotos")
        .select("beobachtung_id, url"),
    ]);

    const beob = beobResult.data;
    if (!beob) {
      setLaden(false);
      return;
    }

    // Vogelarten nach Beobachtung gruppieren
    const artenMap = new Map<number, string[]>();
    for (const a of artenResult.data ?? []) {
      const name = (a.vogelarten as unknown as { name: string })?.name ?? "";
      const liste = artenMap.get(a.beobachtung_id) ?? [];
      liste.push(name);
      artenMap.set(a.beobachtung_id, liste);
    }

    // Fotos nach Beobachtung gruppieren
    const fotosMap = new Map<number, string[]>();
    for (const f of fotosResult.data ?? []) {
      const liste = fotosMap.get(f.beobachtung_id) ?? [];
      liste.push(f.url);
      fotosMap.set(f.beobachtung_id, liste);
    }

    const ergebnisse: Beobachtung[] = beob.map((b) => ({
      ...b,
      vogelarten: artenMap.get(b.id) ?? [],
      fotos: fotosMap.get(b.id) ?? [],
    }));

    setBeobachtungen(ergebnisse);
    setLaden(false);
  }, []);

  useEffect(() => {
    ladeBeobachtungen();
  }, [ladeBeobachtungen]);

  const gefiltert = beobachtungen.filter((b) => {
    const s = suchbegriff.toLowerCase();
    if (!s) return true;
    return (
      b.ort.toLowerCase().includes(s) ||
      b.datum.includes(s) ||
      b.vogelarten.some((v) => v.toLowerCase().includes(s))
    );
  });

  function gruppiereNachDatum() {
    const gruppen: Record<string, Beobachtung[]> = {};
    for (const b of gefiltert) {
      if (!gruppen[b.datum]) gruppen[b.datum] = [];
      gruppen[b.datum].push(b);
    }
    return Object.entries(gruppen).sort(([a], [b]) => b.localeCompare(a));
  }

  function gruppiereNachOrt() {
    const gruppen: Record<string, Beobachtung[]> = {};
    for (const b of gefiltert) {
      if (!gruppen[b.ort]) gruppen[b.ort] = [];
      gruppen[b.ort].push(b);
    }
    return Object.entries(gruppen).sort(([a], [b]) => a.localeCompare(b));
  }

  function gruppiereNachVogelart() {
    const gruppen: Record<string, Beobachtung[]> = {};
    for (const b of gefiltert) {
      for (const art of b.vogelarten) {
        if (!gruppen[art]) gruppen[art] = [];
        gruppen[art].push(b);
      }
    }
    return Object.entries(gruppen).sort(([a], [b]) => a.localeCompare(b));
  }

  const gruppen =
    ansicht === "datum"
      ? gruppiereNachDatum()
      : ansicht === "ort"
        ? gruppiereNachOrt()
        : gruppiereNachVogelart();

  function formatDatum(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("de-DE", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  async function handleExport(b: Beobachtung) {
    const text = [
      `Vogelbeobachtung vom ${formatDatum(b.datum)}`,
      `Ort: ${b.ort} (${b.land})`,
      `Vogelarten: ${b.vogelarten.join(", ")}`,
    ].join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: "Vogelbeobachtung", text });
        return;
      } catch {
        // Teilen abgebrochen – Fallback auf Zwischenablage
      }
    }

    await navigator.clipboard.writeText(text);
    setExportiert(b.id);
    setTimeout(() => setExportiert(null), 2000);
  }

  async function handleLoeschen(id: number) {
    await supabase.from("beobachtung_vogelarten").delete().eq("beobachtung_id", id);
    await supabase.from("fotos").delete().eq("beobachtung_id", id);
    await supabase.from("beobachtungen").delete().eq("id", id);
    setLoeschenId(null);
    await ladeBeobachtungen();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Beobachtungen</h1>

      {/* Filter & Ansicht */}
      <div className="flex flex-col gap-3 mb-6">
        <input
          type="text"
          value={suchbegriff}
          onChange={(e) => setSuchbegriff(e.target.value)}
          placeholder="Suchen (Datum, Ort, Vogelart)..."
          className="border border-stone-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="flex gap-1 flex-wrap">
          {(["datum", "ort", "vogelart"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAnsicht(a)}
              className={`px-3 py-2 rounded text-sm transition-colors ${
                ansicht === a
                  ? "bg-emerald-600 text-white"
                  : "bg-stone-200 text-stone-700 hover:bg-stone-300"
              }`}
            >
              Nach {a.charAt(0).toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {online && (
        <div className="mb-6">
          <ExcelImport onImportiert={ladeBeobachtungen} />
        </div>
      )}

      {!online && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          Du bist offline. Beobachtungen können nur mit Internet angezeigt und bearbeitet werden.
        </p>
      )}

      {laden ? (
        <p className="text-stone-500">Lade Beobachtungen...</p>
      ) : gruppen.length === 0 ? (
        <p className="text-stone-500">Noch keine Beobachtungen vorhanden.</p>
      ) : (
        <div className="space-y-6">
          {gruppen.map(([schluessel, eintraege]) => (
            <div key={schluessel}>
              <h2 className="text-lg font-semibold text-emerald-700 border-b border-stone-200 pb-1 mb-3">
                {ansicht === "datum" ? formatDatum(schluessel) : schluessel}
              </h2>
              <div className="space-y-3">
                {eintraege.map((b) =>
                  bearbeitenId === b.id ? (
                    <BeobachtungBearbeiten
                      key={`edit-${b.id}`}
                      beobachtungId={b.id}
                      datum={b.datum}
                      ort={b.ort}
                      land={b.land}
                      vorhandeneArten={b.vogelarten}
                      onGespeichert={() => {
                        setBearbeitenId(null);
                        ladeBeobachtungen();
                      }}
                      onAbbrechen={() => setBearbeitenId(null)}
                    />
                  ) : (
                    <div
                      key={`${b.id}-${schluessel}`}
                      className="bg-white border border-stone-200 rounded-lg p-4 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                          {ansicht !== "datum" && (
                            <span>📅 {formatDatum(b.datum)}</span>
                          )}
                          {ansicht !== "ort" && <span>📍 {b.ort} ({b.land})</span>}
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleExport(b)}
                            className="text-xs bg-stone-100 text-stone-600 px-2 py-1 rounded hover:bg-blue-100 hover:text-blue-700 transition-colors"
                            title="Exportieren / Teilen"
                          >
                            {exportiert === b.id ? "✓" : "📤"}
                          </button>
                          <button
                            onClick={() => setBearbeitenId(b.id)}
                            className="text-xs bg-stone-100 text-stone-600 px-2 py-1 rounded hover:bg-amber-100 hover:text-amber-700 transition-colors"
                            title="Bearbeiten"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => setLoeschenId(b.id)}
                            className="text-xs bg-stone-100 text-stone-600 px-2 py-1 rounded hover:bg-red-100 hover:text-red-700 transition-colors"
                            title="Löschen"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      {ansicht !== "vogelart" && (
                        <div className="flex flex-wrap gap-1.5">
                          {b.vogelarten.map((art) => (
                            <span
                              key={art}
                              className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded text-sm"
                            >
                              {art}
                            </span>
                          ))}
                        </div>
                      )}
                      {b.fotos.length > 0 && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {b.fotos.map((url) => (
                            <button
                              key={url}
                              onClick={() => setGrossesBild(url)}
                              className="block"
                            >
                              <img
                                src={url}
                                alt="Beobachtungsfoto"
                                className="h-20 w-20 object-cover rounded border border-stone-200 hover:border-emerald-400 transition-colors"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Großes Bild Overlay */}
      {grossesBild && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setGrossesBild(null)}
        >
          <img
            src={grossesBild}
            alt="Foto groß"
            className="max-w-full max-h-full rounded-lg"
          />
        </div>
      )}

      {/* Lösch-Bestätigung */}
      {loeschenId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Beobachtung löschen?</h3>
            <p className="text-sm text-stone-600 mb-4">
              Diese Beobachtung wird unwiderruflich gelöscht, inklusive aller
              zugehörigen Vogelarten und Fotos.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLoeschenId(null)}
                className="px-4 py-2 rounded text-sm bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleLoeschen(loeschenId)}
                className="px-4 py-2 rounded text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Ja, löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
