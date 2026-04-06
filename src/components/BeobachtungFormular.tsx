"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface BekannterOrt {
  ort: string;
  land: string;
}

export interface BeobachtungDaten {
  datum: string;
  ort: string;
  land: string;
  ausgewaehlteArten: number[];
  ausgewaehlteArtenNamen: string[];
  neueArtenNamen: string[];
  kommentar: string;
}

interface Props {
  /** Initialwerte für das Formular */
  initialDatum?: string;
  initialOrt?: string;
  initialLand?: string;
  initialArten?: string[];
  initialNeueArten?: string[];
  initialKommentar?: string;
  /** Ob Online-Features verfügbar sind */
  online?: boolean;
  /** Callback wenn Formular-Daten sich ändern */
  onChange: (daten: BeobachtungDaten) => void;
  /** Farbschema: emerald für Neu, amber für Bearbeiten */
  farbschema?: "emerald" | "amber";
}

export default function BeobachtungFormular({
  initialDatum,
  initialOrt = "",
  initialLand = "D",
  initialArten = [],
  initialNeueArten = [],
  initialKommentar = "",
  online = true,
  onChange,
  farbschema = "emerald",
}: Props) {
  const [datum, setDatum] = useState(
    initialDatum ?? new Date().toISOString().split("T")[0]
  );
  const [ort, setOrt] = useState(initialOrt);
  const [land, setLand] = useState(initialLand);
  const [vogelarten, setVogelarten] = useState<{ id: number; name: string }[]>(
    []
  );
  const [ausgewaehlteArten, setAusgewaehlteArten] = useState<number[]>([]);
  // Names are tracked independently so they're available immediately (before vogelarten load)
  const [ausgewaehlteArtenNamen, setAusgewaehlteArtenNamen] = useState<string[]>(initialArten);
  const [neueArtenNamen, setNeueArtenNamen] = useState<string[]>(initialNeueArten);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [kommentar, setKommentar] = useState(initialKommentar);
  const suchfeldRef = useRef<HTMLInputElement>(null);

  // Ort-Autocomplete
  const [bekannteOrte, setBekannteOrte] = useState<BekannterOrt[]>([]);
  const [ortOffen, setOrtOffen] = useState(false);
  const [ortIndex, setOrtIndex] = useState(-1);
  const ortRef = useRef<HTMLInputElement>(null);
  const ortDropdownRef = useRef<HTMLDivElement>(null);

  // Vogelarten-Keyboard-Navigation
  const [artenIndex, setArtenIndex] = useState(-1);
  const artenListeRef = useRef<HTMLDivElement>(null);

  // Initialisiert: Ob initiale Arten schon aufgelöst wurden
  const [initialisiert, setInitialisiert] = useState(false);

  const ring = farbschema === "emerald" ? "focus:ring-emerald-500" : "focus:ring-amber-500";
  const pillBg = farbschema === "emerald" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800";
  const pillClose = farbschema === "emerald" ? "text-emerald-600 hover:text-emerald-800" : "text-amber-600 hover:text-amber-800";
  const highlightBg = farbschema === "emerald" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900";
  const selectedBg = farbschema === "emerald" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800";
  const addColor = farbschema === "emerald" ? "text-emerald-700 hover:text-emerald-900" : "text-amber-700 hover:text-amber-900";

  // Vogelarten laden (online: von Supabase + in Cache schreiben; offline: aus Cache lesen)
  useEffect(() => {
    async function ladeVogelarten() {
      let data: { id: number; name: string }[] | null = null;

      if (online) {
        const result = await supabase
          .from("vogelarten")
          .select("id, name")
          .order("name");
        if (result.data) {
          data = result.data;
          try {
            localStorage.setItem("vogeltagebuch-vogelarten-cache", JSON.stringify(data));
          } catch {}
        }
      } else {
        try {
          const cached = localStorage.getItem("vogeltagebuch-vogelarten-cache");
          if (cached) data = JSON.parse(cached);
        } catch {}
      }

      if (data) {
        setVogelarten(data);
        if (initialArten.length > 0 && !initialisiert) {
          const gefunden = data.filter((a) => initialArten.includes(a.name));
          setAusgewaehlteArten(gefunden.map((a) => a.id));
          // Sync names to exactly what was found (drops any names not in DB)
          setAusgewaehlteArtenNamen(gefunden.map((a) => a.name));
          setInitialisiert(true);
        }
      }
    }
    ladeVogelarten();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, initialArten, initialisiert]);

  // Bekannte Orte laden
  useEffect(() => {
    async function ladeOrte() {
      if (online) {
        const { data } = await supabase
          .from("beobachtungen")
          .select("ort, land");
        if (data) {
          const unique = new Map<string, string>();
          for (const d of data) {
            if (!unique.has(d.ort)) unique.set(d.ort, d.land);
          }
          setBekannteOrte(
            [...unique.entries()]
              .map(([ort, land]) => ({ ort, land }))
              .sort((a, b) => a.ort.localeCompare(b.ort))
          );
        }
      }
    }
    ladeOrte();
  }, [online]);

  // onChange bei jeder Änderung aufrufen
  useEffect(() => {
    onChange({
      datum,
      ort,
      land,
      ausgewaehlteArten,
      ausgewaehlteArtenNamen,
      neueArtenNamen,
      kommentar,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datum, ort, land, ausgewaehlteArten, ausgewaehlteArtenNamen, neueArtenNamen, kommentar]);

  const gefilterteOrte = ort.trim()
    ? bekannteOrte.filter(
        (o) =>
          o.ort.toLowerCase().includes(ort.toLowerCase()) &&
          o.ort.toLowerCase() !== ort.toLowerCase()
      )
    : [];

  const gefilterteArten = vogelarten.filter((art) =>
    art.name.toLowerCase().includes(suchbegriff.toLowerCase())
  );

  const sichtbareArten = gefilterteArten.filter(
    (a) => !ausgewaehlteArtenNamen.includes(a.name)
  );

  // Reset indices on search change
  useEffect(() => {
    setArtenIndex(-1);
  }, [suchbegriff]);

  useEffect(() => {
    setOrtIndex(-1);
  }, [ort]);

  function waehleOrt(o: BekannterOrt) {
    setOrt(o.ort);
    setLand(o.land);
    setOrtOffen(false);
    setOrtIndex(-1);
  }

  function toggleArt(id: number) {
    const name = vogelarten.find((a) => a.id === id)?.name ?? "";
    setAusgewaehlteArten((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
    if (name) {
      setAusgewaehlteArtenNamen((prev) =>
        prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
      );
    }
    setSuchbegriff("");
    setArtenIndex(-1);
    setTimeout(() => suchfeldRef.current?.focus(), 0);
  }

  function handleOrtKeyDown(e: React.KeyboardEvent) {
    if (!ortOffen || gefilterteOrte.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOrtIndex((prev) => Math.min(prev + 1, gefilterteOrte.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOrtIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && ortIndex >= 0) {
      e.preventDefault();
      waehleOrt(gefilterteOrte[ortIndex]);
    } else if (e.key === "Escape") {
      setOrtOffen(false);
    }
  }

  function handleArtenKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setArtenIndex((prev) => Math.min(prev + 1, sichtbareArten.length - 1));
      setTimeout(() => {
        const items =
          artenListeRef.current?.querySelectorAll("[data-art-item]");
        if (items && artenIndex + 1 < items.length) {
          items[artenIndex + 1]?.scrollIntoView({ block: "nearest" });
        }
      }, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setArtenIndex((prev) => Math.max(prev - 1, -1));
      setTimeout(() => {
        const items =
          artenListeRef.current?.querySelectorAll("[data-art-item]");
        if (items && artenIndex - 1 >= 0) {
          items[artenIndex - 1]?.scrollIntoView({ block: "nearest" });
        }
      }, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (artenIndex >= 0 && artenIndex < sichtbareArten.length) {
        toggleArt(sichtbareArten[artenIndex].id);
      } else if (sichtbareArten.length > 0) {
        toggleArt(sichtbareArten[0].id);
      } else if (gefilterteArten.length === 0 && suchbegriff.trim()) {
        handleNeueArt();
      }
    }
  }

  async function handleNeueArt() {
    const name = suchbegriff.trim();
    if (!name) return;
    if (online) {
      const { data, error } = await supabase
        .from("vogelarten")
        .insert({ name })
        .select("id, name")
        .single();
      if (!error && data) {
        setVogelarten((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        );
        toggleArt(data.id);
      }
    } else {
      setNeueArtenNamen((prev) => [...prev, name]);
    }
    setSuchbegriff("");
    setArtenIndex(-1);
    setTimeout(() => suchfeldRef.current?.focus(), 0);
  }

  // Close ort dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ortRef.current &&
        !ortRef.current.contains(e.target as Node) &&
        ortDropdownRef.current &&
        !ortDropdownRef.current.contains(e.target as Node)
      ) {
        setOrtOffen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Reset-Funktion exponieren über imperative handle
  // Stattdessen: Eltern-Komponente kann initialArten=[] etc. übergeben

  return (
    <div className="space-y-4">
      {/* Datum */}
      <div>
        <label className="block text-sm font-medium mb-1">Datum</label>
        <input
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          className={`border border-stone-300 rounded px-3 py-2 w-full max-w-xs focus:outline-none focus:ring-2 ${ring}`}
        />
      </div>

      {/* Ort & Land */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <label className="block text-sm font-medium mb-1">Ort</label>
          <input
            ref={ortRef}
            type="text"
            value={ort}
            onChange={(e) => {
              setOrt(e.target.value);
              setOrtOffen(true);
            }}
            onFocus={() => setOrtOffen(true)}
            onKeyDown={handleOrtKeyDown}
            placeholder="z.B. Bodensee, Ufer Ost"
            autoComplete="off"
            className={`border border-stone-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 ${ring}`}
          />
          {ortOffen && gefilterteOrte.length > 0 && (
            <div
              ref={ortDropdownRef}
              className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-stone-300 rounded shadow-lg max-h-48 overflow-y-auto"
            >
              {gefilterteOrte.map((o, i) => (
                <button
                  key={o.ort}
                  onClick={() => waehleOrt(o)}
                  className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                    i === ortIndex
                      ? `${selectedBg}`
                      : "hover:bg-stone-50"
                  }`}
                >
                  <span className="font-medium">{o.ort}</span>
                  <span className="text-stone-400 ml-2 text-xs">
                    ({o.land})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-24">
          <label className="block text-sm font-medium mb-1">Land</label>
          <input
            type="text"
            value={land}
            onChange={(e) => setLand(e.target.value.toUpperCase())}
            placeholder="D"
            maxLength={3}
            className={`border border-stone-300 rounded px-3 py-2 w-full text-center focus:outline-none focus:ring-2 ${ring}`}
          />
        </div>
      </div>

      {/* Vogelarten */}
      <div>
        <label className="block text-sm font-medium mb-1">Vogelarten</label>
        <input
          ref={suchfeldRef}
          type="text"
          value={suchbegriff}
          onChange={(e) => setSuchbegriff(e.target.value)}
          onKeyDown={handleArtenKeyDown}
          placeholder="Suchen und Enter zum Hinzufügen..."
          className={`border border-stone-300 rounded px-3 py-2 w-full max-w-md mb-2 focus:outline-none focus:ring-2 ${ring}`}
        />

        {(ausgewaehlteArtenNamen.length > 0 || neueArtenNamen.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {ausgewaehlteArtenNamen.map((name) => (
              <span
                key={name}
                className={`${pillBg} px-2 py-1 rounded text-sm flex items-center gap-1`}
              >
                {name}
                <button
                  onClick={() => {
                    const id = vogelarten.find((a) => a.name === name)?.id;
                    if (id !== undefined) {
                      toggleArt(id);
                    } else {
                      // Vogelarten not loaded yet — remove by name directly
                      setAusgewaehlteArtenNamen((prev) => prev.filter((n) => n !== name));
                    }
                  }}
                  className={pillClose}
                >
                  ×
                </button>
              </span>
            ))}
            {neueArtenNamen.map((name, i) => (
              <span
                key={`new-${i}`}
                className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm flex items-center gap-1"
              >
                {name} (neu)
                <button
                  onClick={() =>
                    setNeueArtenNamen((prev) =>
                      prev.filter((_, j) => j !== i)
                    )
                  }
                  className="text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          ref={artenListeRef}
          className="border border-stone-300 rounded max-h-60 overflow-y-auto"
        >
          {gefilterteArten.map((art) => {
            const istAusgewaehlt = ausgewaehlteArtenNamen.includes(art.name);
            const sichtbarerIndex = istAusgewaehlt
              ? -1
              : sichtbareArten.indexOf(art);
            const istHighlighted =
              !istAusgewaehlt && sichtbarerIndex === artenIndex;
            return (
              <button
                key={art.id}
                data-art-item
                onClick={() => toggleArt(art.id)}
                className={`block w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  istAusgewaehlt
                    ? `${selectedBg} font-medium`
                    : istHighlighted
                      ? highlightBg
                      : "hover:bg-stone-100"
                }`}
              >
                {istAusgewaehlt ? "✓ " : ""}
                {art.name}
              </button>
            );
          })}
          {gefilterteArten.length === 0 && suchbegriff.trim() && (
            <div className="px-3 py-2">
              <p className="text-sm text-stone-500 mb-1">
                Keine Vogelart gefunden.
              </p>
              <button
                onClick={handleNeueArt}
                className={`text-sm font-medium ${addColor}`}
              >
                + &quot;{suchbegriff.trim()}&quot; als neue Vogelart hinzufügen
                <span className="text-stone-400 ml-1 text-xs">(Enter)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kommentar */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Kommentar (optional)
        </label>
        <textarea
          value={kommentar}
          onChange={(e) => setKommentar(e.target.value)}
          placeholder="z.B. Wetter, besondere Beobachtungen..."
          rows={2}
          className={`border border-stone-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 ${ring} resize-y`}
        />
      </div>
    </div>
  );
}
