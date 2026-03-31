"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Beobachtung {
  id: number;
  datum: string;
  ort: string;
  vogelarten: string[];
  fotos: string[];
}

export default function BeobachtungenPage() {
  const [beobachtungen, setBeobachtungen] = useState<Beobachtung[]>([]);
  const [laden, setLaden] = useState(true);
  const [ansicht, setAnsicht] = useState<"datum" | "ort" | "vogelart">(
    "datum"
  );
  const [suchbegriff, setSuchbegriff] = useState("");
  const [grossesBild, setGrossesBild] = useState<string | null>(null);

  useEffect(() => {
    async function ladeBeobachtungen() {
      const { data: beob } = await supabase
        .from("beobachtungen")
        .select("id, datum, ort")
        .order("datum", { ascending: false });

      if (!beob) {
        setLaden(false);
        return;
      }

      const ergebnisse: Beobachtung[] = [];

      for (const b of beob) {
        // Vogelarten laden
        const { data: arten } = await supabase
          .from("beobachtung_vogelarten")
          .select("vogelart_id, vogelarten(name)")
          .eq("beobachtung_id", b.id);

        // Fotos laden
        const { data: fotos } = await supabase
          .from("fotos")
          .select("url")
          .eq("beobachtung_id", b.id);

        ergebnisse.push({
          ...b,
          vogelarten:
            arten?.map(
              (a: Record<string, unknown>) =>
                (a.vogelarten as { name: string })?.name ?? ""
            ) ?? [],
          fotos: fotos?.map((f) => f.url) ?? [],
        });
      }

      setBeobachtungen(ergebnisse);
      setLaden(false);
    }
    ladeBeobachtungen();
  }, []);

  const gefiltert = beobachtungen.filter((b) => {
    const s = suchbegriff.toLowerCase();
    if (!s) return true;
    return (
      b.ort.toLowerCase().includes(s) ||
      b.datum.includes(s) ||
      b.vogelarten.some((v) => v.toLowerCase().includes(s))
    );
  });

  // Gruppierung
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Beobachtungen</h1>

      {/* Filter & Ansicht */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={suchbegriff}
          onChange={(e) => setSuchbegriff(e.target.value)}
          placeholder="Suchen (Datum, Ort, Vogelart)..."
          className="border border-stone-300 rounded px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="flex gap-1">
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
                {eintraege.map((b) => (
                  <div
                    key={`${b.id}-${schluessel}`}
                    className="bg-white border border-stone-200 rounded-lg p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600 mb-2">
                      {ansicht !== "datum" && (
                        <span>📅 {formatDatum(b.datum)}</span>
                      )}
                      {ansicht !== "ort" && <span>📍 {b.ort}</span>}
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
                ))}
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
    </div>
  );
}
