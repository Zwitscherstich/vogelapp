import { supabase, ladeAlleZeilen } from "./supabase";
import { speicherSnapshot, ladeSnapshot } from "./offlineDb";
import {
  ZIEL_LISTE_LAENGE,
  type Snapshot,
  type SnapshotBeobachtung,
  type TopArt,
} from "./schnellzugabeChips";

/** Aelter als eine Minute gilt als veraltet. */
export const SNAPSHOT_MAX_ALTER_MS = 60_000;

interface VerknuepfungsZeile {
  beobachtung_id: number;
  vogelart_id: number;
  vogelarten: { name: string } | null;
}

/**
 * Laedt den aktuellen Stand aus Supabase und legt ihn in IndexedDB ab.
 * Gibt null zurueck, wenn nichts geladen werden konnte.
 */
export async function snapshotAktualisieren(): Promise<Snapshot | null> {
  try {
    const [beobResult, verknuepfungen] = await Promise.all([
      supabase
        .from("beobachtungen")
        .select("id, datum, ort, land")
        .order("id", { ascending: false })
        .limit(ZIEL_LISTE_LAENGE),
      // Immer seitenweise: PostgREST schneidet sonst still bei 1000 Zeilen ab.
      ladeAlleZeilen<VerknuepfungsZeile>((von, bis) =>
        supabase
          .from("beobachtung_vogelarten")
          .select("beobachtung_id, vogelart_id, vogelarten(name)")
          .order("id")
          .range(von, bis)
      ),
    ]);

    if (beobResult.error || !beobResult.data) return null;

    // Arten je Beobachtung buendeln
    const proBeobachtung = new Map<number, { id: number; name: string }[]>();
    // Gesamthaeufigkeit ueber alle Beobachtungen
    const gesamt = new Map<number, { name: string; anzahl: number }>();

    for (const z of verknuepfungen) {
      const name = (z.vogelarten as unknown as { name: string })?.name ?? "";
      if (!name) continue;

      const liste = proBeobachtung.get(z.beobachtung_id) ?? [];
      liste.push({ id: z.vogelart_id, name });
      proBeobachtung.set(z.beobachtung_id, liste);

      const g = gesamt.get(z.vogelart_id);
      if (g) g.anzahl += 1;
      else gesamt.set(z.vogelart_id, { name, anzahl: 1 });
    }

    const beobachtungen: SnapshotBeobachtung[] = beobResult.data.map((b) => ({
      id: b.id,
      datum: b.datum,
      ort: b.ort,
      land: b.land,
      arten: proBeobachtung.get(b.id) ?? [],
    }));

    const topArten: TopArt[] = [...gesamt.entries()]
      .map(([id, v]) => ({ id, name: v.name, anzahl: v.anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de"))
      .slice(0, 50);

    const snapshot: Snapshot = {
      id: "aktuell",
      erstelltAm: new Date().toISOString(),
      beobachtungen,
      topArten,
    };

    await speicherSnapshot(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

/** Liest den zwischengespeicherten Stand, ohne zu laden. Wirft, wenn die
 *  lokale Datenbank nicht verfuegbar ist -- der Aufrufer entscheidet. */
export async function snapshotHolen(): Promise<Snapshot | null> {
  return ladeSnapshot();
}
