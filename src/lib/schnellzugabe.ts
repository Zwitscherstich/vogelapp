import { supabase } from "./supabase";
import { saveArtNachtrag } from "./offlineDb";
import type { ZugabeErgebnis } from "./schnellzugabeChips";

/** Postgres: unique_violation. */
const UNIQUE_VERLETZUNG = "23505";

export type ZuzufuegendeArt = { id: number } | { neuerName: string };

/**
 * Haengt eine Vogelart an eine bestehende Beobachtung an.
 *
 * Diese Funktion loescht niemals Verknuepfungen - sie fuegt nur hinzu.
 * Online wird direkt geschrieben, offline in die Warteschlange gelegt.
 */
export async function artHinzufuegen(
  beobachtungId: number,
  art: ZuzufuegendeArt,
  online: boolean
): Promise<ZugabeErgebnis> {
  if (!online) {
    try {
      const neuerName = "neuerName" in art ? art.neuerName.trim() : undefined;
      if ("neuerName" in art && !neuerName) {
        return { status: "fehler", meldung: "Bitte einen Artnamen angeben." };
      }
      await saveArtNachtrag({
        beobachtungId,
        vogelartId: "id" in art ? art.id : undefined,
        neuerName,
      });
      return { status: "wartet" };
    } catch (e: unknown) {
      return { status: "fehler", meldung: fehlertext(e) };
    }
  }

  try {
    const vogelartId = "id" in art ? art.id : await artAnlegen(art.neuerName);
    if (vogelartId === null) {
      return { status: "fehler", meldung: "Vogelart konnte nicht angelegt werden." };
    }

    // Vorab pruefen: die Datenbank hat moeglicherweise keinen Unique-Constraint
    const { data: vorhanden, error: pruefFehler } = await supabase
      .from("beobachtung_vogelarten")
      .select("id")
      .eq("beobachtung_id", beobachtungId)
      .eq("vogelart_id", vogelartId)
      .limit(1);

    // Ohne verlaesslichen Vorab-Check darf nicht eingefuegt werden: ohne
    // Unique-Constraint wuerde ein Blind-Insert eine doppelte Verknuepfung
    // erzeugen, die niemand bemerkt.
    if (pruefFehler) {
      return { status: "fehler", meldung: pruefFehler.message };
    }

    if (vorhanden && vorhanden.length > 0) return { status: "vorhanden" };

    const { error } = await supabase
      .from("beobachtung_vogelarten")
      .insert({ beobachtung_id: beobachtungId, vogelart_id: vogelartId });

    if (error) {
      // Falls doch ein Constraint existiert und parallel geschrieben wurde:
      // die Art ist verknuepft, das Ziel ist erreicht.
      if ((error as { code?: string }).code === UNIQUE_VERLETZUNG) {
        return { status: "vorhanden" };
      }
      return { status: "fehler", meldung: error.message };
    }

    return { status: "hinzugefuegt" };
  } catch (e: unknown) {
    return { status: "fehler", meldung: fehlertext(e) };
  }
}

/** Legt eine Art an oder liefert die Id einer gleichnamigen bestehenden. */
async function artAnlegen(name: string): Promise<number | null> {
  const sauber = name.trim();
  if (!sauber) return null;

  const { data: vorhanden, error: pruefFehler } = await supabase
    .from("vogelarten")
    .select("id")
    .eq("name", sauber)
    .limit(1);

  // Bei fehlgeschlagener Pruefung keine neue Art anlegen – sonst entstuende
  // ein Duplikat in den Stammdaten.
  if (pruefFehler) return null;

  if (vorhanden && vorhanden.length > 0) return vorhanden[0].id;

  const { data, error } = await supabase
    .from("vogelarten")
    .insert({ name: sauber })
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id;
}

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : "Unbekannter Fehler";
}
