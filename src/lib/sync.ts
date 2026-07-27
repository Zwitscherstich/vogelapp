import { supabase } from "./supabase";
import {
  getOfflineBeobachtungen,
  deleteOfflineBeobachtung,
  updateOfflineBeobachtung,
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
      let artenUnvollstaendig = false;

      for (const rohName of beob.neueVogelarten) {
        const name = rohName.trim();
        if (!name) continue;

        const { data: vorhanden, error: pruefFehler } = await supabase
          .from("vogelarten")
          .select("id")
          .eq("name", name)
          .limit(1);

        // Ohne verlaessliche Pruefung nichts anlegen: sonst entstuende ein
        // Duplikat in den Stammdaten.
        if (pruefFehler) {
          artenUnvollstaendig = true;
          break;
        }

        if (vorhanden && vorhanden.length > 0) {
          alleArtIds.push(vorhanden[0].id);
          continue;
        }

        const { data: neue, error: anlegeFehler } = await supabase
          .from("vogelarten")
          .insert({ name })
          .select("id")
          .single();

        if (anlegeFehler || !neue) {
          artenUnvollstaendig = true;
          break;
        }
        alleArtIds.push(neue.id);
      }

      // Konnte nicht jede Art aufgeloest werden, wird die Beobachtung NICHT
      // angelegt. Sonst laege sie unvollstaendig auf dem Server, waehrend die
      // lokale Kopie geloescht wuerde -- der Nutzer verlaere Arten, die er
      // erfasst hat. Beim naechsten Durchlauf erneut versuchen.
      if (artenUnvollstaendig) continue;

      // Beobachtung anlegen -- oder die aus einem frueheren, nur halb
      // gelungenen Versuch wiederverwenden.
      let beobachtungId = beob.serverId ?? null;

      if (beobachtungId === null) {
        const { data: beobachtung, error: beobError } = await supabase
          .from("beobachtungen")
          .insert({ datum: beob.datum, ort: beob.ort, land: beob.land })
          .select("id")
          .single();

        if (beobError || !beobachtung) continue;
        beobachtungId = beobachtung.id;

        // Sofort lokal vermerken: schlaegt das Verknuepfen gleich fehl, darf
        // der naechste Versuch die Beobachtung nicht ein zweites Mal anlegen.
        // (`?? undefined`: supabase-js liefert hier ungetypt `any`, wodurch
        // TypeScript den deklarierten Typ `number | null` beibehaelt, obwohl
        // an dieser Stelle laengst eine Zahl feststeht.)
        await updateOfflineBeobachtung(beob.tempId!, {
          serverId: beobachtungId ?? undefined,
        });
      }

      // Vogelarten verknüpfen
      if (alleArtIds.length > 0) {
        // Nach dieser einen Beobachtung gefiltert, daher unkritisch klein.
        const { data: schonDa, error: schonDaFehler } = await supabase
          .from("beobachtung_vogelarten")
          .select("vogelart_id")
          .eq("beobachtung_id", beobachtungId);

        if (schonDaFehler) continue;

        const vorhandeneIds = new Set(
          (schonDa ?? []).map((z) => z.vogelart_id)
        );
        // Ohne Dedup wuerden zwei Namen, die auf dieselbe Art zeigen
        // ("Amsel" und "Amsel "), zwei identische Verknuepfungen erzeugen.
        const fehlende = [...new Set(alleArtIds)].filter(
          (id) => !vorhandeneIds.has(id)
        );

        if (fehlende.length > 0) {
          const { error: verknuepfFehler } = await supabase
            .from("beobachtung_vogelarten")
            .insert(
              fehlende.map((vogelart_id) => ({
                beobachtung_id: beobachtungId,
                vogelart_id,
              }))
            );

          if (verknuepfFehler) {
            // 23505 heisst NICHT zwangslaeufig "alles schon vorhanden": ein
            // mehrzeiliger Insert ist atomar, eine einzige Kollision laesst
            // den ganzen Stapel zurueckrollen. Statt zu raten wird nachgesehen,
            // was tatsaechlich verknuepft ist -- die lokale Kopie darf erst
            // weg, wenn wirklich jede Art auf dem Server liegt.
            const { data: nachher, error: nachpruefFehler } = await supabase
              .from("beobachtung_vogelarten")
              .select("vogelart_id")
              .eq("beobachtung_id", beobachtungId);

            if (nachpruefFehler) continue;

            const jetztVorhanden = new Set(
              (nachher ?? []).map((z) => z.vogelart_id)
            );
            const immerNochFehlend = [...new Set(alleArtIds)].filter(
              (id) => !jetztVorhanden.has(id)
            );

            if (immerNochFehlend.length > 0) continue;
          }
        }
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
        // Leerer Name nach dem Trimmen: der Eintrag ist unbrauchbar und wuerde
        // sonst eine namenlose Art in den Stammdaten anlegen.
        if (!name) {
          await deleteArtNachtrag(n.tempId!);
          continue;
        }
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
