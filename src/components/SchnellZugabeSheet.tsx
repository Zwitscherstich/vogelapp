"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase, ladeAlleZeilen } from "@/lib/supabase";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { getCachedVogelarten } from "@/lib/offlineDb";
import { artHinzufuegen } from "@/lib/schnellzugabe";
import {
  snapshotAktualisieren,
  snapshotHolen,
  SNAPSHOT_MAX_ALTER_MS,
} from "@/lib/schnellzugabeSnapshot";
import {
  chipsBerechnen,
  type ChipVorschlag,
  type Snapshot,
} from "@/lib/schnellzugabeChips";

type ArtStatus = "hinzugefuegt" | "wartet" | "vorhanden";

export default function SchnellZugabeSheet({
  onSchliessen,
}: {
  onSchliessen: () => void;
}) {
  const online = useOnlineStatus();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [zielId, setZielId] = useState<number | null>(null);
  const [zielZurueckgesetzt, setZielZurueckgesetzt] = useState(false);
  const [zielListeOffen, setZielListeOffen] = useState(false);
  const [chipBasis, setChipBasis] = useState<ChipVorschlag[]>([]);
  const [status, setStatus] = useState<Record<number, ArtStatus>>({});
  const [anzahl, setAnzahl] = useState(0);
  const [suche, setSuche] = useState("");
  const [alleArten, setAlleArten] = useState<{ id: number; name: string }[]>([]);
  const [fehler, setFehler] = useState("");
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [dbFehler, setDbFehler] = useState("");

  // Merkt sich, fuer welches Ziel die Chip-Reihe berechnet wurde.
  const chipsFuerZiel = useRef<number | null>(null);

  // Spiegelt zielId in einen Ref, damit der Lade-Effekt den aktuellen Wert
  // lesen kann, ohne zielId in seine Abhaengigkeitsliste aufzunehmen (das
  // wuerde den Effekt bei jeder Zielwahl erneut auslösen).
  const zielIdRef = useRef<number | null>(null);
  zielIdRef.current = zielId;

  // Snapshot laden: frisch holen wenn online und veraltet, sonst zwischengespeichert
  useEffect(() => {
    let abgebrochen = false;
    async function laden() {
      let s: Snapshot | null = null;
      try {
        s = await snapshotHolen();
      } catch (e: unknown) {
        if (abgebrochen) return;
        setDbFehler(e instanceof Error ? e.message : "Lokale Datenbank nicht verfuegbar.");
        setLaedt(false);
        return;
      }
      const veraltet =
        !s || Date.now() - new Date(s.erstelltAm).getTime() > SNAPSHOT_MAX_ALTER_MS;
      if (online && veraltet) {
        const frisch = await snapshotAktualisieren();
        if (frisch) s = frisch;
      }
      if (abgebrochen) return;
      setSnapshot(s);

      // Ziel nur beim allerersten Laden vorbelegen. Sonst setzt ein Online/
      // Offline-Wechsel eine vom Nutzer gewaehlte Zielbeobachtung wieder auf
      // die neueste zurueck -- und die naechste Zugabe landete stillschweigend
      // an der falschen Beobachtung.
      //
      // Ausnahme: der Snapshot haelt nur die letzten ZIEL_LISTE_LAENGE
      // Beobachtungen. Faellt das gewaehlte Ziel aus diesem Fenster, waere es
      // nicht mehr auffindbar und das Sheet zeigte faelschlich "Noch keine
      // Beobachtung vorhanden". Dann auf die neueste zurueckfallen -- und das
      // dem Nutzer sagen, statt das Ziel stillschweigend zu wechseln.
      const bisher = zielIdRef.current;
      const neueste = s?.beobachtungen[0]?.id ?? null;
      if (bisher === null) {
        setZielId(neueste);
      } else {
        const nochVorhanden = s?.beobachtungen.some((b) => b.id === bisher) ?? false;
        if (!nochVorhanden) {
          setZielId(neueste);
          setZielZurueckgesetzt(true);
        }
      }
      setLaedt(false);
    }
    laden();
    return () => {
      abgebrochen = true;
    };
  }, [online]);

  // Artenliste fuer die Suche
  useEffect(() => {
    let abgebrochen = false;
    async function laden() {
      if (online) {
        try {
          const arten = await ladeAlleZeilen<{ id: number; name: string }>(
            (von, bis) =>
              supabase
                .from("vogelarten")
                .select("id, name")
                .order("name")
                .order("id")
                .range(von, bis)
          );
          if (abgebrochen) return;
          if (arten.length > 0) {
            setAlleArten(arten);
            return;
          }
        } catch {
          // Netz gemeldet, Abfrage trotzdem fehlgeschlagen: auf den lokalen
          // Bestand zurueckfallen, statt die Suche leer zu lassen.
        }
      }

      const gecacht = await getCachedVogelarten();
      if (!abgebrochen) setAlleArten(gecacht);
    }
    laden();
    return () => {
      abgebrochen = true;
    };
  }, [online]);

  // Chips einmal je Ziel festlegen – nicht bei jeder Zugabe neu berechnen,
  // sonst bricht die Reihe waehrend eines Bursts unter dem Daumen um.
  useEffect(() => {
    if (!snapshot || zielId === null) return;

    // Nur neu berechnen, wenn der Nutzer das Ziel tatsaechlich gewechselt hat.
    // Ein blosser Wechsel der Snapshot-Referenz (etwa durch einen Online/
    // Offline-Wechsel, der ladeSnapshot erneut aufruft) darf die Reihe nicht
    // umbrechen und den Zaehler nicht zuruecksetzen.
    if (chipsFuerZiel.current === zielId) return;
    chipsFuerZiel.current = zielId;

    setChipBasis(chipsBerechnen(snapshot, zielId));
    setStatus({});
    setAnzahl(0);
  }, [snapshot, zielId]);

  const ziel = snapshot?.beobachtungen.find((b) => b.id === zielId) ?? null;

  const vorhandeneIds = useMemo(
    () => new Set((ziel?.arten ?? []).map((a) => a.id)),
    [ziel]
  );

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return alleArten
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [suche, alleArten]);

  const exakterTreffer = alleArten.some(
    (a) => a.name.toLowerCase() === suche.trim().toLowerCase()
  );

  async function hinzufuegen(art: { id: number } | { neuerName: string }) {
    if (zielId === null || beschaeftigt) return;
    setBeschaeftigt(true);
    setFehler("");

    const ergebnis = await artHinzufuegen(zielId, art, online);

    if (ergebnis.status === "fehler") {
      setFehler(ergebnis.meldung);
    } else {
      if ("id" in art) {
        setStatus((s) => ({ ...s, [art.id]: ergebnis.status }));
      }
      if (ergebnis.status !== "vorhanden") setAnzahl((n) => n + 1);
      setSuche("");
    }
    setBeschaeftigt(false);
  }

  function datumKurz(iso: string) {
    const jetzt = new Date();
    const heute = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-${String(jetzt.getDate()).padStart(2, "0")}`;
    if (iso === heute) return "heute";
    return new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Schließen"
        onClick={onSchliessen}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-2 pb-1">
          <span className="block w-10 h-1 rounded-full bg-stone-300" />
        </div>

        {laedt ? (
          <p className="px-4 py-6 text-sm text-stone-500">Lade…</p>
        ) : dbFehler ? (
          <div className="px-4 py-6 space-y-3">
            <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
              {dbFehler}
            </p>
            <button
              onClick={() => location.reload()}
              className="bg-emerald-600 text-white px-4 py-2 rounded text-sm"
            >
              Neu laden
            </button>
          </div>
        ) : !ziel ? (
          <div className="px-4 py-6 space-y-3">
            <p className="text-sm text-stone-600">
              Noch keine Beobachtung vorhanden
              {!online && " – und offline sind keine Daten zwischengespeichert"}.
            </p>
            <a
              href="/"
              className="inline-block bg-emerald-600 text-white px-4 py-2 rounded text-sm"
            >
              Neue Beobachtung anlegen
            </a>
          </div>
        ) : (
          <>
            {/* Zielleiste */}
            <button
              onClick={() => setZielListeOffen((o) => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 border-b border-stone-200 text-left"
            >
              <span className="text-emerald-700">→</span>
              <span className="font-medium text-sm">
                {ziel.ort} ({ziel.land})
              </span>
              <span className="text-stone-500 text-sm">
                {datumKurz(ziel.datum)}
              </span>
              <span className="ml-auto text-stone-400 text-xs">
                {zielListeOffen ? "▲" : "▼"} ändern
              </span>
            </button>

            {!online && (
              <p className="px-4 py-1.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                Offline – Stand zwischengespeichert, Zugaben werden später synchronisiert.
              </p>
            )}

            {zielZurueckgesetzt && (
              <p className="px-4 py-1.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                Die zuvor gewählte Beobachtung steht nicht mehr in der Liste –
                Ziel wurde auf die neueste zurückgesetzt.
              </p>
            )}

            {zielListeOffen && (
              <div className="border-b border-stone-200 max-h-52 overflow-y-auto">
                {snapshot!.beobachtungen.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setZielId(b.id);
                      setZielListeOffen(false);
                      setZielZurueckgesetzt(false);
                    }}
                    className={`block w-full text-left px-4 py-2.5 text-sm border-b border-stone-100 ${
                      b.id === zielId ? "bg-emerald-50 text-emerald-800" : ""
                    }`}
                  >
                    {b.ort} ({b.land})
                    <span className="text-stone-400 ml-2 text-xs">
                      {datumKurz(b.datum)} · {b.arten.length} Arten
                    </span>
                  </button>
                ))}
              </div>
            )}

            {fehler && (
              <p className="mx-4 my-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                {fehler}
              </p>
            )}

            {/* Suche – bewusst ohne Autofokus, damit die Tastatur die Chips nicht verdeckt */}
            <div className="px-4 pt-3">
              <input
                type="text"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Suchen…"
                className="border border-stone-300 rounded px-3 py-2 w-full text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {suche.trim() ? (
              <div className="px-4 py-2">
                {treffer.map((a) => {
                  const drin = vorhandeneIds.has(a.id) || status[a.id] === "vorhanden";
                  const gesetzt = status[a.id] === "hinzugefuegt" || status[a.id] === "wartet";
                  return (
                    <button
                      key={a.id}
                      disabled={drin || gesetzt || beschaeftigt}
                      onClick={() => hinzufuegen({ id: a.id })}
                      className={`block w-full text-left px-3 py-3 text-sm border-b border-stone-100 ${
                        drin || gesetzt ? "text-stone-400" : "hover:bg-stone-50"
                      }`}
                    >
                      {a.name}
                      {drin && <span className="ml-2 text-xs">✓ schon erfasst</span>}
                      {gesetzt && <span className="ml-2 text-xs">✓ hinzugefügt</span>}
                    </button>
                  );
                })}
                {!exakterTreffer && (
                  <button
                    disabled={beschaeftigt}
                    onClick={() => hinzufuegen({ neuerName: suche.trim() })}
                    className="block w-full text-left px-3 py-3 text-sm text-emerald-700 font-medium"
                  >
                    + &quot;{suche.trim()}&quot; als neue Vogelart hinzufügen
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {chipBasis.map((c) => {
                  const s = status[c.id];
                  const erledigt = s === "hinzugefuegt" || s === "wartet";
                  return (
                    <button
                      key={c.id}
                      disabled={erledigt || s === "vorhanden" || beschaeftigt}
                      onClick={() => hinzufuegen({ id: c.id })}
                      className={`px-3 py-3 rounded-full text-sm border transition-colors ${
                        erledigt
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 opacity-60"
                          : s === "vorhanden"
                            ? "bg-stone-50 text-stone-400 border-stone-200"
                            : "bg-white text-stone-800 border-stone-300 active:bg-stone-100"
                      }`}
                    >
                      {erledigt ? "✓ " : ""}
                      {s === "wartet" ? "🕓 " : ""}
                      {c.name}
                      {s === "vorhanden" ? " (schon erfasst)" : ""}
                    </button>
                  );
                })}
                {chipBasis.length === 0 && (
                  <p className="text-sm text-stone-500">
                    Keine Vorschläge – über die Suche hinzufügen.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 px-4 py-3 border-t border-stone-200 sticky bottom-0 bg-white">
              <span className="text-sm text-stone-600">
                {anzahl === 0
                  ? "Noch nichts hinzugefügt"
                  : `${anzahl} hinzugefügt`}
              </span>
              <button
                onClick={onSchliessen}
                className="ml-auto bg-emerald-600 text-white px-5 py-2 rounded text-sm"
              >
                Fertig
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
