// Reine Rangfolge-Logik für die Schnellzugabe.
//
// Bewusst ohne Importe: Node fuehrt TypeScript nur mit expliziten
// .ts-Endungen bei relativen Importen aus, waehrend die tsconfig des
// Projekts (moduleResolution "bundler") genau diese Endungen verbietet.
// Ein Modul ohne Importe erfuellt beides und bleibt direkt testbar.

export interface SnapshotArt {
  id: number;
  name: string;
}

export interface SnapshotBeobachtung {
  id: number;
  datum: string;
  ort: string;
  land: string;
  arten: SnapshotArt[];
}

export interface TopArt {
  id: number;
  name: string;
  anzahl: number;
}

export interface Snapshot {
  id: "aktuell";
  erstelltAm: string;
  /** Die letzten 10 Beobachtungen, neueste zuerst. */
  beobachtungen: SnapshotBeobachtung[];
  /** Gesamthaeufigkeit ueber alle Beobachtungen, zum Auffuellen. */
  topArten: TopArt[];
}

export interface ChipVorschlag {
  id: number;
  name: string;
}

export type ZugabeErgebnis =
  | { status: "hinzugefuegt" }
  | { status: "vorhanden" }
  | { status: "wartet" }
  | { status: "fehler"; meldung: string };

export const MAX_CHIPS = 8;
export const FENSTER_GROESSE = 5;
export const ZIEL_LISTE_LAENGE = 10;

/**
 * Vorschlaege fuer die Chip-Reihe.
 *
 * Haeufigkeit innerhalb der letzten `fensterGroesse` Beobachtungen, aufgefuellt
 * mit den insgesamt haeufigsten Arten. Arten, die die Zielbeobachtung bereits
 * enthaelt, werden entfernt.
 *
 * Ein Fenster ueber Beobachtungen statt ueber Tage ist Absicht: ein Zeitfenster
 * waere nach einer Pause leer - also genau dann, wenn die App fuer eine neue
 * Sitzung geoeffnet wird.
 */
export function chipsBerechnen(
  snapshot: Snapshot,
  zielId: number,
  maxChips: number = MAX_CHIPS,
  fensterGroesse: number = FENSTER_GROESSE
): ChipVorschlag[] {
  const ziel = snapshot.beobachtungen.find((b) => b.id === zielId);
  const vorhanden = new Set((ziel?.arten ?? []).map((a) => a.id));

  const gesamt = new Map<number, number>();
  for (const t of snapshot.topArten) gesamt.set(t.id, t.anzahl);

  // 1. Haeufigkeit im Fenster zaehlen
  const zaehler = new Map<number, { name: string; anzahl: number }>();
  for (const beob of snapshot.beobachtungen.slice(0, fensterGroesse)) {
    for (const art of beob.arten) {
      const vorher = zaehler.get(art.id);
      if (vorher) vorher.anzahl += 1;
      else zaehler.set(art.id, { name: art.name, anzahl: 1 });
    }
  }

  // 2. Bereits erfasste Arten entfernen und sortieren
  const kandidaten = [...zaehler.entries()]
    .filter(([id]) => !vorhanden.has(id))
    .map(([id, v]) => ({ id, name: v.name, anzahl: v.anzahl }))
    .sort(
      (a, b) =>
        b.anzahl - a.anzahl ||
        (gesamt.get(b.id) ?? 0) - (gesamt.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name, "de")
    );

  const ergebnis: ChipVorschlag[] = kandidaten.map((k) => ({
    id: k.id,
    name: k.name,
  }));

  // 3. Mit Gesamtfavoriten auffuellen
  if (ergebnis.length < maxChips) {
    const schonDrin = new Set(ergebnis.map((c) => c.id));
    const auffuellung = snapshot.topArten
      .filter((t) => !vorhanden.has(t.id) && !schonDrin.has(t.id))
      .sort(
        (a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de")
      );
    for (const t of auffuellung) {
      if (ergebnis.length >= maxChips) break;
      ergebnis.push({ id: t.id, name: t.name });
    }
  }

  return ergebnis.slice(0, maxChips);
}
