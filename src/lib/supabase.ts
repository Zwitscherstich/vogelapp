import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Holt ALLE Zeilen einer Abfrage seitenweise.
 *
 * Supabase/PostgREST begrenzt jede Abfrage serverseitig (Standard: 1000 Zeilen)
 * und meldet dabei KEINEN Fehler – zu viele Zeilen werden still abgeschnitten.
 * Für Tabellen, die mit der Zeit wachsen (z.B. beobachtung_vogelarten), muss
 * deshalb immer geblättert werden.
 *
 * Die Abfrage MUSS stabil sortiert sein, sonst kann das Blättern Zeilen
 * überspringen oder doppelt liefern.
 */
export async function ladeAlleZeilen<T>(
  // `data` bewusst als unknown: supabase-js typisiert eingebettete Relationen
  // als Array, obwohl zur Laufzeit ein Objekt geliefert wird. Die Aufrufer
  // geben die tatsächliche Zeilenform über T an.
  seite: (von: number, bis: number) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>,
  seitenGroesse = 500
): Promise<T[]> {
  const alle: T[] = [];
  let von = 0;

  for (;;) {
    const { data, error } = await seite(von, von + seitenGroesse - 1);
    if (error) throw new Error(error.message);

    const zeilen = data as T[] | null;
    if (!zeilen || zeilen.length === 0) break;

    alle.push(...zeilen);
    // Um die tatsächlich gelieferte Anzahl weiterrücken, nicht um seitenGroesse:
    // so bleibt das Blättern auch dann korrekt, wenn der Server ein kleineres
    // Limit erzwingt als angefordert.
    von += zeilen.length;
  }

  return alle;
}
