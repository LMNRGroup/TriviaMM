"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PublicRoomState } from "@/lib/types/game";

function formatSeconds(iso: string | null, now: number) {
  if (!iso) {
    return "0";
  }

  const remaining = Math.max(0, new Date(iso).getTime() - now) / 1000;
  return remaining.toFixed(0);
}

export default function HomePage() {
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function syncRoom() {
      try {
        const stateResponse = await fetch("/api/public/state", { cache: "no-store" });
        const statePayload = await stateResponse.json();

        if (!stateResponse.ok || !statePayload.ok) {
          return;
        }

        let nextRoom = statePayload.data.room as PublicRoomState;

        if (
          nextRoom.phase !== "idle" ||
          nextRoom.players.player1 ||
          nextRoom.players.player2 ||
          nextRoom.lobby.waitingEndsAt
        ) {
          const tickResponse = await fetch("/api/public/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const tickPayload = await tickResponse.json();

          if (tickResponse.ok && tickPayload.ok) {
            nextRoom = tickPayload.data.room as PublicRoomState;
          }
        }

        if (!cancelled) {
          setRoom(nextRoom);
        }
      } catch {
        // Keep the display resilient even if polling fails briefly.
      }
    }

    void syncRoom();
    const poll = window.setInterval(() => {
      void syncRoom();
    }, 900);
    const timer = window.setInterval(() => setNow(Date.now()), 100);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(timer);
    };
  }, []);

  const countdown = useMemo(() => {
    if (!room || room.phase !== "countdown") {
      return null;
    }

    return formatSeconds(room.countdown.endsAt, now);
  }, [now, room]);

  const footerState = useMemo(() => {
    if (!room || !room.players.player1) {
      return {
        label: "Esperando Jugadores",
        toneClass: "text-[color:var(--accent)]",
        showDots: true,
      };
    }

    if (room.phase === "countdown") {
      if (room.mode === "battle") {
        return {
          label: `El reto comienza en ${countdown ?? "10"}`,
          toneClass: "text-[color:var(--success)]",
          showDots: false,
        };
      }

      return {
        label: "El reto esta por comenzar",
        toneClass: "text-[color:var(--success)]",
        showDots: false,
      };
    }

    if (room.players.player1 && !room.players.player2) {
      return {
        label: "1/2 Jugadores en la sala",
        toneClass: "text-[color:var(--success)]",
        showDots: true,
      };
    }

    if (room.players.player1 && room.players.player2) {
      return {
        label: "2/2 Jugadores en la sala",
        toneClass: "text-[color:var(--success)]",
        showDots: true,
      };
    }

    return {
      label: "Esperando Jugadores",
      toneClass: "text-[color:var(--accent)]",
      showDots: true,
    };
  }, [countdown, room]);

  const qrValue = room?.qrUrl || "https://triviamm.local/play";

  return (
    <main className="display-viewport">
      <section className="display-stage">
        <div className="display-canvas">
          <div className="display-frame battle-card">
            <div className="display-orb display-orb-left" />
            <div className="display-orb display-orb-right" />

            <div className="display-content">
              <div className="display-header">
                <span className="display-kicker">Pantalla Principal</span>
              </div>

              <div className="display-body">
                <div className="display-copy">
                  <p className="font-display text-[2rem] uppercase tracking-[0.48em] text-[color:var(--accent)]">
                    Sala de Espera
                  </p>
                  <h1 className="display-title font-display text-[8.5rem] font-black uppercase leading-[0.9] tracking-[0.08em] text-[color:var(--foreground)]">
                    <span className="display-title-line">RETO</span>
                    <span className="display-title-line block text-[color:var(--accent-cool)]">TRIVIA</span>
                  </h1>
                  <p className="max-w-[700px] text-[2.2rem] leading-[1.35] text-[color:var(--muted)]">
                    Escanea el codigo desde tu telefono para entrar a la partida.
                  </p>
                </div>

                <div className="display-qr-shell glass-panel float-slow">
                  <div className="display-qr-frame">
                    <div className="display-qr-art">
                      <QRCodeSVG
                        value={qrValue}
                        size={440}
                        bgColor="transparent"
                        fgColor="#f4f7fb"
                        includeMargin={false}
                        level="H"
                      />
                    </div>
                  </div>
                  <p className="font-display mt-10 text-center text-[2rem] font-black uppercase tracking-[0.22em] text-[color:var(--foreground)]">
                    Escanea para jugar
                  </p>
                </div>
              </div>

              <div className="display-footer">
                <p className={`display-waiting font-display text-[4rem] font-black uppercase tracking-[0.18em] ${footerState.toneClass}`}>
                  <span>{footerState.label}</span>
                  {footerState.showDots ? (
                    <span className="display-dots" aria-hidden="true">
                      <span className="display-dot">.</span>
                      <span className="display-dot">.</span>
                      <span className="display-dot">.</span>
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="display-legal-bar">
                <p className="display-legal">
                  © Luminar Apps. Todos los derechos reservados. Desarrollado para Municipio Autónomo de Mayagüez.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
