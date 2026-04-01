import { supabase } from "./supabase";
import {
  getOfflineBeobachtungen,
  deleteOfflineBeobachtung,
  getOfflineVogelarten,
  deleteOfflineVogelart,
} from "./offlineDb";

export async function syncOfflineData(): Promise<number> {
  let synced = 0;

  // 1. Offline-Vogelarten synchronisieren
  const offlineArten = await getOfflineVogelarten();
  for (const art of offlineArten) {
    const { error } = await supabase.from("vogelarten").insert({ name: art.name });
    if (!error) {
      await deleteOfflineVogelart(art.tempId!);
      synced++;
    }
  }

  // 2. Offline-Beobachtungen synchronisieren
  const offlineBeob = await getOfflineBeobachtungen();
  for (const beob of offlineBeob) {
    try {
      // Zuerst neue Vogelarten anlegen und IDs sammeln
      const alleArtIds = [...beob.vogelartIds];

      for (const name of beob.neueVogelarten) {
        // Prüfen ob die Art inzwischen existiert
        const { data: existing } = await supabase
          .from("vogelarten")
          .select("id")
          .eq("name", name)
          .single();

        if (existing) {
          alleArtIds.push(existing.id);
        } else {
          const { data: neue, error } = await supabase
            .from("vogelarten")
            .insert({ name })
            .select("id")
            .single();
          if (!error && neue) {
            alleArtIds.push(neue.id);
          }
        }
      }

      // Beobachtung anlegen
      const { data: beobachtung, error: beobError } = await supabase
        .from("beobachtungen")
        .insert({ datum: beob.datum, ort: beob.ort })
        .select("id")
        .single();

      if (beobError) continue;

      // Vogelarten verknüpfen
      if (alleArtIds.length > 0) {
        const artEintraege = alleArtIds.map((vogelart_id) => ({
          beobachtung_id: beobachtung.id,
          vogelart_id,
        }));
        await supabase.from("beobachtung_vogelarten").insert(artEintraege);
      }

      await deleteOfflineBeobachtung(beob.tempId!);
      synced++;
    } catch {
      // Bei Fehler diesen Eintrag überspringen und beim nächsten Mal erneut versuchen
      continue;
    }
  }

  return synced;
}
