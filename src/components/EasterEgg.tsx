"use client";

import { useState, useEffect, useCallback } from "react";

interface Vogel {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  wobble: number;
  delay: number;
  emoji: string;
}

const VOEGEL_EMOJIS = ["🐦", "🦅", "🦆", "🦉", "🦜", "🐧", "🦩", "🦚", "🕊️", "🦢"];

export default function EasterEgg() {
  const [aktiv, setAktiv] = useState(false);
  const [voegel, setVoegel] = useState<Vogel[]>([]);
  const [klicks, setKlicks] = useState(0);
  const [nachricht, setNachricht] = useState(false);

  const starten = useCallback(() => {
    const neueVoegel: Vogel[] = [];
    for (let i = 0; i < 30; i++) {
      neueVoegel.push({
        id: i,
        x: -10 - Math.random() * 40,
        y: 10 + Math.random() * 70,
        size: 20 + Math.random() * 28,
        speed: 2 + Math.random() * 4,
        wobble: Math.random() * Math.PI * 2,
        delay: Math.random() * 2000,
        emoji: VOEGEL_EMOJIS[Math.floor(Math.random() * VOEGEL_EMOJIS.length)],
      });
    }
    setVoegel(neueVoegel);
    setAktiv(true);
    setNachricht(true);

    setTimeout(() => {
      setAktiv(false);
      setNachricht(false);
      setVoegel([]);
    }, 8000);
  }, []);

  useEffect(() => {
    function handleKlick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-vogel-logo]")) {
        setKlicks((prev) => {
          const neu = prev + 1;
          if (neu >= 5) {
            starten();
            return 0;
          }
          return neu;
        });
      }
    }

    // Klick-Zähler zurücksetzen nach 3 Sekunden Pause
    let timeout: ReturnType<typeof setTimeout>;
    function resetTimer() {
      clearTimeout(timeout);
      timeout = setTimeout(() => setKlicks(0), 3000);
    }

    window.addEventListener("click", handleKlick);
    window.addEventListener("click", resetTimer);
    return () => {
      window.removeEventListener("click", handleKlick);
      window.removeEventListener("click", resetTimer);
      clearTimeout(timeout);
    };
  }, [starten]);

  if (!aktiv) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {/* Vögel fliegen über den Bildschirm */}
      {voegel.map((v) => (
        <div
          key={v.id}
          className="absolute"
          style={{
            fontSize: `${v.size}px`,
            animation: `flyAcross ${8 / v.speed}s linear ${v.delay}ms forwards,
                         wobble ${0.3 + Math.random() * 0.4}s ease-in-out ${v.delay}ms infinite alternate`,
            top: `${v.y}%`,
            left: "-5%",
            filter: `drop-shadow(2px 4px 6px rgba(0,0,0,0.2))`,
          }}
        >
          {v.emoji}
        </div>
      ))}

      {/* Nachricht */}
      {nachricht && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: "fadeMessage 6s ease-in-out forwards" }}
        >
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-2xl border border-emerald-200 text-center max-w-sm mx-4">
            <p className="text-4xl mb-3">🐦✨</p>
            <p className="text-xl font-bold text-emerald-800 mb-1">
              Vogelflug!
            </p>
            <p className="text-stone-600 text-sm">
              Du hast den geheimen Schwarm entdeckt!
              <br />
              Frohes Beobachten!
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes flyAcross {
          0% { transform: translateX(0); }
          100% { transform: translateX(110vw); }
        }
        @keyframes wobble {
          0% { margin-top: -12px; }
          100% { margin-top: 12px; }
        }
        @keyframes fadeMessage {
          0% { opacity: 0; transform: scale(0.8); }
          15% { opacity: 1; transform: scale(1); }
          75% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95) translateY(-20px); }
        }
      `}</style>
    </div>
  );
}
