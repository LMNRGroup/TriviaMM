"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import type { AnswerFeedback, PublicRoomState } from "@/lib/types/game";

function formatSeconds(iso: string | null, now: number, decimals = 0) {
  if (!iso) {
    return decimals > 0 ? `0.${"0".repeat(decimals)}` : "0";
  }

  const remaining = Math.max(0, new Date(iso).getTime() - now) / 1000;
  return remaining.toFixed(decimals);
}

function getFeedbackGlow(feedback: AnswerFeedback, side: "left" | "right") {
  if (feedback === "correct") {
    return `${side}-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_center,rgba(61,224,163,0.32),transparent_72%)]`;
  }

  if (feedback === "incorrect" || feedback === "timeout") {
    return `${side}-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,107,107,0.3),transparent_72%)]`;
  }

  return "";
}

function SeatCard({
  title,
  playerName,
  cityLabel,
  score,
  slot,
}: {
  title: string;
  playerName: string;
  cityLabel: string;
  score: number;
  slot: "P1" | "P2";
}) {
  return (
    <div className="glass-panel battle-card rounded-[1.8rem] p-5">
      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">{title}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-4xl font-black uppercase">{slot}</p>
          <p className="mt-2 font-display text-2xl font-black uppercase">{playerName}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{cityLabel}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-black text-[color:var(--accent)]">{score}</p>
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">pts</p>
        </div>
      </div>
    </div>
  );
}

export function HostRoomClient() {
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function syncRoom() {
      try {
        const stateResponse = await fetch("/api/public/state", { cache: "no-store" });
        const statePayload = await stateResponse.json();

        if (!stateResponse.ok || !statePayload.ok) {
          throw new Error(statePayload.message ?? "No se pudo cargar la pantalla principal.");
        }

        const nextRoom = statePayload.data.room as PublicRoomState;

        if (!cancelled) {
          setRoom(nextRoom);
        }

        if (!cancelled && nextRoom.phase !== "idle" && nextRoom.phase !== "lobby") {
          const tickResponse = await fetch("/api/public/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const tickPayload = await tickResponse.json();

          if (tickResponse.ok && tickPayload.ok && !cancelled) {
            setRoom(tickPayload.data.room as PublicRoomState);
          }
        }

        if (!cancelled) {
          setError(null);
        }
      } catch (syncError) {
        if (!cancelled) {
          setError(syncError instanceof Error ? syncError.message : "No se pudo sincronizar la sala.");
        }
      }
    }

    syncRoom();
    const poll = window.setInterval(syncRoom, 700);
    const timer = window.setInterval(() => setNow(Date.now()), 100);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(timer);
    };
  }, []);

  const timerLabel = useMemo(() => {
    if (!room) {
      return "--";
    }

    if (room.phase === "countdown") {
      return formatSeconds(room.countdown.endsAt, now, 0);
    }

    if (room.phase === "question-read") {
      return formatSeconds(room.currentQuestion.answersVisibleAt, now, 1);
    }

    if (room.phase === "question") {
      return formatSeconds(room.currentQuestion.endsAt, now, 1);
    }

    return "--";
  }, [now, room]);

  const phaseCopy = useMemo(() => {
    if (!room) {
      return "Conectando...";
    }

    switch (room.phase) {
      case "idle":
        return "Escanea y entra a la arena.";
      case "lobby":
        return room.players.player2 ? "Duelo listo para comenzar." : "Esperando al segundo jugador.";
      case "countdown":
        return "Preparando la arena.";
      case "question-read":
        return "Lee la pregunta. Las respuestas aparecen en breve.";
      case "question":
        return "Responde antes de que acabe el tiempo.";
      case "answer-lock":
        return "Respuestas cerradas. Procesando...";
      case "battle-result":
        return "Resultado final del duelo.";
      case "leaderboard":
        return "Tabla general en pantalla.";
      case "finished":
      case "reset":
        return "Reiniciando la arena para la próxima partida.";
      default:
        return room.phase;
    }
  }, [room]);

  const showLobby = !room || room.phase === "idle" || room.phase === "lobby";
  const showQuestion = room && (room.phase === "question-read" || room.phase === "question");
  const leftGlow = room?.phase === "answer-lock" && room.mode === "battle" ? getFeedbackGlow(room.answerFeedback.player1, "left") : "";
  const rightGlow = room?.phase === "answer-lock" && room.mode === "battle" ? getFeedbackGlow(room.answerFeedback.player2, "right") : "";

  const hostAfkMessage = useMemo(() => {
    if (!room) {
      return null;
    }

    if (room.mode === "solo" && room.warnings.player1AfkWarningVisible) {
      return "Alerta AFK: el jugador en solitario lleva dos preguntas sin responder. Un tercer silencio reinicia la partida y no sumará al ranking.";
    }

    if (
      room.mode === "battle" &&
      room.unansweredStreaks.player1 >= 2 &&
      room.unansweredStreaks.player2 >= 2
    ) {
      return "Alerta AFK: ambos duelistas acumulan racha sin respuesta. Si ambos fallan tres seguidas, la arena se reinicia.";
    }

    return null;
  }, [room]);

  const leaderboardHighlightRanks = useMemo(() => {
    if (!room?.leaderboard) {
      return [];
    }

    const p1 = room.leaderboard.player1Rank;
    const p2 = room.leaderboard.player2Rank;

    if (room.mode === "solo") {
      return typeof p1 === "number" ? [p1] : [];
    }

    return [p1, p2].filter((value): value is number => typeof value === "number");
  }, [room]);

  return (
    <section className="mx-auto flex w-full max-w-[1920px] items-center justify-center">
      <div className="glass-panel battle-card app-shell aspect-[16/9] w-full overflow-hidden rounded-[2.6rem] p-6 xl:p-8">
        <div className="hero-mesh" />
        {leftGlow ? <div className={`pointer-events-none absolute ${leftGlow}`} /> : null}
        {rightGlow ? <div className={`pointer-events-none absolute ${rightGlow}`} /> : null}

        <div className="relative flex h-full flex-col gap-5">
          <header className="flex items-start justify-between gap-6">
            <div>
              <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">Trivia Battle</p>
              <h1 className="font-display mt-3 text-5xl font-black uppercase tracking-[0.12em] xl:text-7xl">
                Pantalla principal
              </h1>
              <p className="status-dot mt-4 text-base leading-7 text-[color:var(--muted)]">{phaseCopy}</p>
              {hostAfkMessage ? (
                <div className="mt-4 max-w-3xl rounded-[1.2rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm font-semibold leading-6 text-red-100">
                  {hostAfkMessage}
                </div>
              ) : null}
            </div>

            <div className="min-w-[13rem] rounded-[1.8rem] border border-white/10 bg-white/6 px-5 py-4 text-right">
              <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Estado</p>
              <p className="font-display mt-3 text-2xl font-black uppercase text-[color:var(--accent-cool)]">
                {room?.phase.replace("-", " ") ?? "cargando"}
              </p>
              {(room?.phase === "countdown" || room?.phase === "question-read" || room?.phase === "question") && (
                <>
                  <p className="mt-4 text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
                    {room?.phase === "question-read" ? "respuestas en" : "tiempo"}
                  </p>
                  <p
                    className={`font-display mt-2 text-6xl font-black ${room?.phase === "question" && Number(timerLabel) <= 5 ? "timer-critical" : ""}`}
                  >
                    {timerLabel}
                  </p>
                </>
              )}
            </div>
          </header>

          <div className="grid flex-1 gap-5 xl:grid-cols-[1.5fr_0.7fr]">
            <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(5,10,20,0.78),rgba(7,12,24,0.96))] p-6">
              {showLobby ? (
                <div className="grid h-full gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="flex flex-col justify-between">
                    <div>
                      <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">
                        Escanea y juega
                      </p>
                      <h2 className="font-display mt-4 max-w-3xl text-5xl font-black uppercase leading-[0.95] xl:text-7xl">
                        ¿Te atreves a entrar a la batalla?
                      </h2>
                      <p className="mt-5 max-w-2xl text-lg leading-8 text-[color:var(--muted)]">
                        Escanea el código con tu celular. Regístrate, espera a tu rival y compite por el mejor tiempo.
                      </p>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <SeatCard
                        title="Jugador 1"
                        slot="P1"
                        playerName={room?.players.player1?.name ?? "Esperando jugador"}
                        cityLabel={room?.players.player1?.city ?? "Toma tu celular y escanea"}
                        score={room?.scores.player1 ?? 0}
                      />
                      <SeatCard
                        title="Jugador 2"
                        slot="P2"
                        playerName={room?.players.player2?.name ?? "Lugar disponible"}
                        cityLabel={room?.players.player2?.city ?? "Segundo retador pendiente"}
                        score={room?.scores.player2 ?? 0}
                      />
                    </div>
                  </div>

                  <div className="glass-panel glow-accent flex flex-col items-center justify-center rounded-[2rem] p-6 text-center">
                    <QRCodeSVG
                      bgColor="transparent"
                      fgColor="#f4f7fb"
                      size={250}
                      value={room?.qrUrl ?? ""}
                    />
                    <p className="font-display mt-6 text-lg font-black uppercase tracking-[0.18em] text-[color:var(--accent)]">
                      /play
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                      Regístrate en tu celular y entra a la partida en vivo.
                    </p>
                    {room?.lobby.waitingEndsAt ? (
                      <p className="mt-5 rounded-full border border-white/10 px-4 py-2 text-sm text-[color:var(--muted)]">
                        Ventana de espera: {formatSeconds(room.lobby.waitingEndsAt, now, 0)}s
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showQuestion ? (
                <div className="flex h-full flex-col justify-between gap-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">
                        Pregunta {room.currentQuestion.questionIndex} / {room.currentQuestion.totalQuestions}
                      </p>
                      <h2 className="font-display mt-4 text-4xl font-black uppercase leading-[1.02] xl:text-6xl">
                        {room.currentQuestion.prompt}
                      </h2>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {(Object.entries(room.currentQuestion.choices ?? {}) as Array<[string, string]>).map(([key, value]) => (
                      <div
                        className={`rounded-[1.6rem] border px-5 py-5 text-lg leading-7 ${
                          room.phase === "question"
                            ? "border-white/12 bg-white/7"
                            : "border-white/8 bg-white/4 opacity-45"
                        }`}
                        key={key}
                      >
                        <p className="font-display text-2xl font-black uppercase text-[color:var(--accent-cool)]">{key}</p>
                        <p className="mt-2">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {room?.phase === "countdown" ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">
                    {room.mode === "battle" ? "Duelo por comenzar" : "El reto está por comenzar"}
                  </p>
                  <h2 className="countdown-pop font-display mt-6 text-8xl font-black uppercase xl:text-[13rem]">
                    {timerLabel}
                  </h2>
                </div>
              ) : null}

              {room?.phase === "answer-lock" ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent-cool)]">
                    Respuestas cerradas
                  </p>
                  <h2 className="font-display mt-5 text-5xl font-black uppercase xl:text-7xl">
                    Calculando la ronda
                  </h2>
                  <p className="mt-5 text-lg text-[color:var(--muted)]">
                    {room.mode === "battle"
                      ? "La pantalla se enciende a cada lado según el resultado de cada jugador."
                      : "Preparando la siguiente pregunta."}
                  </p>
                </div>
              ) : null}

              {room?.phase === "battle-result" ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent-strong)]">Ganador</p>
                  <h2 className="font-display mt-6 text-6xl font-black uppercase xl:text-8xl">
                    {room.battleResult.winner === "player1"
                      ? room.players.player1?.name
                      : room.battleResult.winner === "player2"
                        ? room.players.player2?.name
                        : "Empate"}
                  </h2>
                </div>
              ) : null}

              {room?.phase === "leaderboard" ? (
                <div className="space-y-5">
                  <div>
                    <p className="font-display text-sm uppercase tracking-[0.4em] text-[color:var(--accent)]">Leaderboard</p>
                    <h2 className="font-display mt-4 text-5xl font-black uppercase">Top jugadores</h2>
                  </div>
                  <LeaderboardList entries={room.leaderboard.visibleTop} highlightRanks={leaderboardHighlightRanks} />
                </div>
              ) : null}

              {room?.phase === "finished" || room?.phase === "reset" ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">Siguiente partida</p>
                  <h2 className="font-display mt-5 text-5xl font-black uppercase xl:text-7xl">
                    Reiniciando la arena
                  </h2>
                </div>
              ) : null}
            </section>

            <aside className="grid gap-5">
              <SeatCard
                title="Lado izquierdo"
                slot="P1"
                playerName={room?.players.player1?.name ?? "Disponible"}
                cityLabel={room?.players.player1?.city ?? "Espera a que alguien escanee"}
                score={room?.scores.player1 ?? 0}
              />
              <SeatCard
                title="Lado derecho"
                slot="P2"
                playerName={room?.players.player2?.name ?? "Disponible"}
                cityLabel={room?.players.player2?.city ?? "Modo duelo opcional"}
                score={room?.scores.player2 ?? 0}
              />
              <div className="glass-panel rounded-[1.8rem] p-5">
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Instrucciones visibles</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--muted)]">
                  <li>1. Escanea el QR y completa el registro.</li>
                  <li>2. Lee la pregunta durante 10 segundos.</li>
                  <li>3. Cuando aparezcan las respuestas, tendrás 15 segundos para contestar.</li>
                  <li>4. Gana quien acierte más rápido.</li>
                </ul>
              </div>
              {error ? (
                <div className="rounded-[1.5rem] border border-[color:var(--danger)]/35 bg-[color:var(--danger)]/10 px-4 py-4 text-sm text-red-100">
                  {error}
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
