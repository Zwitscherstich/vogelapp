import { supabase } from "./supabase";
import {
  getOfflineBeobachtungen,
  deleteOfflineBeobachtung,
  getOfflineVogelarten,
  deleteOfflineVogelart,
  getArtNachtraege,
  deleteArtNachtrag,
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
        .insert({ datum: beob.datum, ort: beob.ort, land: beob.land })
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

  // 3. Nachtraege aus der Schnellzugabe – bewusst zuletzt, damit sie auf
  //    Beobachtungen zutreffen koennen, die gerade erst synchronisiert wurden.
  const nachtraege = await getArtNachtraege();
  for (const n of nachtraege) {
    try {
      let vogelartId = n.vogelartId ?? null;

      if (vogelartId === null && n.neuerName) {
        const name = n.neuerName.trim();
        const { data: vorhandeneArt, error: artFehler } = await supabase
          .from("vogelarten")
          .select("id")
          .eq("name", name)
          .limit(1);

        // Bei fehlgeschlagener Pruefung nichts anlegen: sonst entstuende ein
        // Duplikat in den Stammdaten. Der Eintrag bleibt in der Warteschlange.
        if (artFehler) continue;

        if (vorhandeneArt && vorhandeneArt.length > 0) {
          vogelartId = vorhandeneArt[0].id;
        } else {
          const { data: neueArt, error } = await supabase
            .from("vogelarten")
            .insert({ name })
            .select("id")
            .single();
          if (error || !neueArt) continue;
          vogelartId = neueArt.id;
        }
      }

      if (vogelartId === null) {
        // Weder Id noch Name: der Eintrag ist unbrauchbar, sonst bliebe er ewig.
        await deleteArtNachtrag(n.tempId!);
        continue;
      }

      // Existiert die Zielbeobachtung ueberhaupt noch?
      const { data: zielBeob, error: zielFehler } = await supabase
        .from("beobachtungen")
        .select("id")
        .eq("id", n.beobachtungId)
        .limit(1);

      // Nur bei einer erfolgreichen Abfrage darf "nicht gefunden" als
      // "geloescht" gewertet werden. Ein Lesefehler bedeutet nur, dass wir es
      // gerade nicht wissen -- der Eintrag bleibt fuer den naechsten Versuch
      // in der Warteschlange.
      if (zielFehler) continue;

      if (!zielBeob || zielBeob.length === 0) {
        await deleteArtNachtrag(n.tempId!);
        continue;
      }

      const { data: schonDa, error: schonDaFehler } = await supabase
        .from("beobachtung_vogelarten")
        .select("id")
        .eq("beobachtung_id", n.beobachtungId)
        .eq("vogelart_id", vogelartId)
        .limit(1);

      // Ohne verlaessliche Pruefung nicht einfuegen: ohne Unique-Constraint
      // entstuende sonst eine doppelte Verknuepfung.
      if (schonDaFehler) continue;

      if (!schonDa || schonDa.length === 0) {
        const { error } = await supabase
          .from("beobachtung_vogelarten")
          .insert({ beobachtung_id: n.beobachtungId, vogelart_id: vogelartId });
        // 23505 bedeutet: parallel bereits angelegt – ebenfalls erledigt.
        if (error && (error as { code?: string }).code !== "23505") continue;
      }

      await deleteArtNachtrag(n.tempId!);
      synced++;
    } catch {
      continue;
    }
  }

  return synced;
}
