"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import {
  saveOfflineBeobachtung,
} from "@/lib/offlineDb";
import BeobachtungFormular, {
  BeobachtungDaten,
} from "@/components/BeobachtungFormular";
import {
  setLetzteEingabe,
  scheduleWochenerinnerung,
  istAktiviert,
} from "@/lib/notifications";

const ENTWURF_KEY = "vogeltagebuch-neueBeobachtung";

interface Entwurf {
  datum: string;
  ort: string;
  land: string;
  artenNamen: string[];
  neueArtenNamen: string[];
  kommentar: string;
}

function ladeEntwurf(): Entwurf | null {
  try {
    const raw = localStorage.getItem(ENTWURF_KEY);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entwurf;
    // Nur wiederherstellen wenn tatsächlich Inhalt vorhanden
    if (e.ort?.trim() || e.artenNamen?.length > 0 || e.neueArtenNamen?.length > 0 || e.kommentar?.trim()) {
      return e;
    }
  } catch {}
  return null;
}

export default function NeuePage() {
  const online = useOnlineStatus();
  const [speichern, setSpeichern] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [fehler, setFehler] = useState("");
  const [formKey, setFormKey] = useState(0);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<File[]>([]);

  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [entwurfWiederhergestellt, setEntwurfWiederhergestellt] = useState(false);
  // Prevents the initial onChange (with empty values) from wiping the draft
  const entwurfGeladen = useRef(false);

  // Load draft on mount (client-only)
  useEffect(() => {
    const gespeicherter = ladeEntwurf();
    if (gespeicherter) {
      setEntwurf(gespeicherter);
      setEntwurfWiederhergestellt(true);
      setFormKey((k) => k + 1);
    }
    // Mark as loaded so speicherEntwurf can start saving
    entwurfGeladen.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const datenRef = useRef<BeobachtungDaten>({
    datum: new Date().toISOString().split("T")[0],
    ort: "",
    land: "D",
    ausgewaehlteArten: [],
    ausgewaehlteArtenNamen: [],
    neueArtenNamen: [],
    kommentar: "",
  });

  function speicherEntwurf(daten: BeobachtungDaten) {
    try {
      const hatInhalt =
        daten.ort.trim() ||
        (daten.ausgewaehlteArtenNamen?.length ?? 0) > 0 ||
        daten.neueArtenNamen.length > 0 ||
        daten.kommentar.trim();

      if (hatInhalt) {
        const neu: Entwurf = {
          datum: daten.datum,
          ort: daten.ort,
          land: daten.land,
          artenNamen: daten.ausgewaehlteArtenNamen ?? [],
          neueArtenNamen: daten.neueArtenNamen,
          kommentar: daten.kommentar,
        };
        localStorage.setItem(ENTWURF_KEY, JSON.stringify(neu));
      } else {
        localStorage.removeItem(ENTWURF_KEY);
      }
    } catch {}
  }

  function handleChange(daten: BeobachtungDaten) {
    datenRef.current = daten;
    if (entwurfGeladen.current) {
      speicherEntwurf(daten);
    }
  }

  function verwerfEntwurf() {
    localStorage.removeItem(ENTWURF_KEY);
    setEntwurf(null);
    setEntwurfWiederhergestellt(false);
    setFormKey((k) => k + 1);
  }

  async function handleSpeichern() {
    const { datum, ort, land, ausgewaehlteArten, neueArtenNamen, kommentar } =
      datenRef.current;

    if (
      !datum ||
      !ort ||
      (ausgewaehlteArten.length === 0 && neueArtenNamen.length === 0)
    ) {
      setFehler("Bitte Datum, Ort und mindestens eine Vogelart angeben.");
      return;
    }

    setSpeichern(true);
    setFehler("");

    try {
      if (online) {
        const { data: beobachtung, error: beobError } = await supabase
          .from("beobachtungen")
          .insert({ datum, ort, land, kommentar: kommentar || null })
          .select("id")
          .single();

        if (beobError) throw beobError;

        const alleArtIds = [...ausgewaehlteArten];
        for (const name of neueArtenNamen) {
          const { data: neue, error } = await supabase
            .from("vogelarten")
            .insert({ name })
            .select("id, name")
            .single();
          if (!error && neue) {
            alleArtIds.push(neue.id);
          }
        }

        const artEintraege = alleArtIds.map((vogelart_id) => ({
          beobachtung_id: beobachtung.id,
          vogelart_id,
        }));

        const { error: artError } = await supabase
          .from("beobachtung_vogelarten")
          .insert(artEintraege);

        if (artError) throw artError;

        for (const foto of fotos) {
          const dateiname = `${beobachtung.id}/${Date.now()}-${foto.name}`;
          const { error: uploadError } = await supabase.storage
            .from("fotos")
            .upload(dateiname, foto);

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("fotos").getPublicUrl(dateiname);

          await supabase
            .from("fotos")
            .insert({ beobachtung_id: beobachtung.id, url: publicUrl });
        }
      } else {
        await saveOfflineBeobachtung({
          datum,
          ort,
          land,
          vogelartIds: ausgewaehlteArten,
          neueVogelarten: neueArtenNamen,
        });
      }

      // Track save time for weekly notification
      setLetzteEingabe();
      if (istAktiviert()) {
        scheduleWochenerinnerung();
      }

      // Clear draft and reset form
      localStorage.removeItem(ENTWURF_KEY);
      setEntwurf(null);
      setEntwurfWiederhergestellt(false);
      setErfolg(true);
      setFotos([]);
      setFormKey((k) => k + 1);
      setTimeout(() => setErfolg(false), 3000);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unbekannter Fehler";
      setFehler("Fehler beim Speichern: " + message);
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Neue Beobachtung</h1>

      {entwurfWiederhergestellt && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded mb-4 flex items-center justify-between">
          <span className="text-sm">Entwurf wiederhergestellt.</span>
          <button
            onClick={verwerfEntwurf}
            className="text-amber-600 hover:text-amber-800 text-sm underline ml-4"
          >
            Verwerfen
          </button>
        </div>
      )}

      {erfolg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded mb-4">
          {online
            ? "Beobachtung gespeichert!"
            : "Beobachtung offline gespeichert – wird synchronisiert sobald du online bist."}
        </div>
      )}

      {fehler && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          {fehler}
        </div>
      )}

      <div className="space-y-6">
        <BeobachtungFormular
          key={formKey}
          initialDatum={entwurf?.datum}
          initialOrt={entwurf?.ort ?? ""}
          initialLand={entwurf?.land ?? "D"}
          initialArten={entwurf?.artenNamen ?? []}
          initialNeueArten={entwurf?.neueArtenNamen ?? []}
          initialKommentar={entwurf?.kommentar ?? ""}
          online={online}
          onChange={handleChange}
          farbschema="emerald"
        />

        {/* Fotos */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Fotos (optional){!online && " – nur mit Internet"}
          </label>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                setFotos((prev) => [...prev, ...Array.from(e.target.files!)]);
              }
            }}
            className="hidden"
          />
          {fotos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {fotos.map((foto, i) => (
                <div key={i} className="relative group">
                  <img
                    src={URL.createObjectURL(foto)}
                    alt="Vorschau"
                    className="h-20 w-20 object-cover rounded border border-stone-200"
                  />
                  <button
                    onClick={() =>
                      setFotos((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => fotoInputRef.current?.click()}
            disabled={!online}
            className="text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            📷 Fotos auswählen
          </button>
        </div>

        {/* Speichern */}
        <button
          onClick={handleSpeichern}
          disabled={speichern}
          className="bg-emerald-600 text-white px-6 py-2 rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {speichern
            ? "Wird gespeichert..."
            : online
              ? "Beobachtung speichern"
              : "Offline speichern"}
        </button>
      </div>
    </div>
  );
}
