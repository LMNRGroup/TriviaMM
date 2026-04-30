"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { decideRoomAcceptance } from "@/lib/game/public-room-guard";
import type { AnswerFeedback, PublicRoomState } from "@/lib/types/game";

const BATTLE_MODE_ENABLED =
  (process.env.NEXT_PUBLIC_ENABLE_BATTLE_MODE ?? "").trim().toLowerCase() === "1" ||
  (process.env.NEXT_PUBLIC_ENABLE_BATTLE_MODE ?? "").trim().toLowerCase() === "true" ||
  (process.env.NEXT_PUBLIC_ENABLE_BATTLE_MODE ?? "").trim().toLowerCase() === "yes";

function emitHostDebug(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent("trivia:client-debug", {
      detail: {
        role: "host",
        ...detail,
      },
    }),
  );
}

function formatSeconds(iso: string | null, now: number, decimals = 0) {
  if (!iso) {
    return decimals > 0 ? `0.${"0".repeat(decimals)}` : "0";
  }

  const remaining = Math.max(0, new Date(iso).getTime() - now) / 1000;
  return remaining.toFixed(decimals);
}

function formatAverageSeconds(milliseconds: number | null | undefined) {
  if (typeof milliseconds !== "number") {
    return "--";
  }

  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatResponseSeconds(milliseconds: number | null | undefined) {
  if (typeof milliseconds !== "number") {
    return "--";
  }

  return `${(milliseconds / 1000).toFixed(2)}s`;
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

function getFeedbackLabel(feedback: AnswerFeedback) {
  if (feedback === "correct") {
    return "Correcta";
  }

  if (feedback === "incorrect") {
    return "Incorrecta";
  }

  if (feedback === "timeout") {
    return "Sin respuesta";
  }

  return "Esperando validación";
}

function getFeedbackCardTone(feedback: AnswerFeedback) {
  if (feedback === "correct") {
    return "border-[color:var(--success)]/45 bg-[color:var(--success)]/12";
  }

  if (feedback === "incorrect" || feedback === "timeout") {
    return "border-[color:var(--danger)]/45 bg-[color:var(--danger)]/12";
  }

  return "border-white/10 bg-white/6";
}

function SeatCard({
  title,
  playerName,
  cityLabel,
  score,
  slot,
  compact = false,
}: {
  title: string;
  playerName: string;
  cityLabel: string;
  score: number;
  slot: "P1" | "P2";
  compact?: boolean;
}) {
  return (
    <div className={`glass-panel battle-card rounded-[1.8rem] ${compact ? "p-4" : "p-5"}`}>
      <p className={`uppercase tracking-[0.35em] text-[color:var(--muted)] ${compact ? "text-[11px]" : "text-xs"}`}>{title}</p>
      <div className={`${compact ? "mt-3" : "mt-4"} flex items-end justify-between gap-4`}>
        <div>
          <p className={`font-display font-black uppercase ${compact ? "text-3xl" : "text-4xl"}`}>{slot}</p>
          <p className={`font-display font-black uppercase ${compact ? "mt-1 text-xl" : "mt-2 text-2xl"}`}>{playerName}</p>
          <p className={`${compact ? "text-xs" : "text-sm"} text-[color:var(--muted)]`}>{cityLabel}</p>
        </div>
        <div className="text-right">
          <p className={`font-display font-black text-[color:var(--accent)] ${compact ? "text-3xl" : "text-4xl"}`}>{score}</p>
          <p className={`${compact ? "text-[11px]" : "text-xs"} uppercase tracking-[0.35em] text-[color:var(--muted)]`}>pts</p>
        </div>
      </div>
    </div>
  );
}

function toUniversityIconLabel(value: string | null | undefined) {
  const cleaned = (value ?? "")
    .trim()
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();

  if (cleaned.length >= 4) {
    return cleaned.slice(0, 4);
  }

  if (cleaned.length >= 2) {
    return cleaned;
  }

  return "UNI";
}

function BroadcastTopPlayerPanel({
  side,
  slot,
  name,
  university,
  points,
}: {
  side: "left" | "right";
  slot: "P1" | "P2";
  name: string;
  university: string;
  points: number;
}) {
  const icon = (
    <span className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-white/15 bg-white/7 px-2 text-[11px] font-black uppercase tracking-[0.1em] text-[color:var(--accent-cool)]">
      {toUniversityIconLabel(university)}
    </span>
  );

  return (
    <div className="host-top-player-panel glass-panel battle-card h-full rounded-[1.4rem] px-4 py-3">
      <div className="flex h-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">{slot}</p>
          <div className="mt-2 flex items-center gap-2">
            {side === "left" ? icon : null}
            <p className="host-top-player-name truncate font-display text-xl font-black uppercase">{name}</p>
            {side === "right" ? icon : null}
          </div>
        </div>
        <div className="text-right">
          <p className="host-top-player-points font-display text-5xl font-black text-[color:var(--accent)]">{points}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">pts</p>
        </div>
      </div>
    </div>
  );
}

export function HostRoomClient() {
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const syncInFlightRef = useRef(false);
  const lastAcceptedVersionRef = useRef(0);
  const ignoredStaleStateCountRef = useRef(0);
  const currentMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncRoom() {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;

      try {
        const stateResponse = await fetch("/api/public/state", {
          cache: "no-store",
          headers: currentMatchIdRef.current
            ? {
                "x-trivia-current-match-id": currentMatchIdRef.current,
              }
            : undefined,
        });
        const statePayload = await stateResponse.json();

        if (!stateResponse.ok || !statePayload.ok) {
          if (statePayload?.error === "room_unavailable") {
            return;
          }
          throw new Error(statePayload.message ?? "No se pudo cargar la pantalla principal.");
        }

        const nextRoom = statePayload.data.room as PublicRoomState;
        let accepted = true;
        let reason = "";
        let details = "";
        let previousVersion = lastAcceptedVersionRef.current;
        let previousPhase: PublicRoomState["phase"] | null = null;

        setRoom((current) => {
          if (current) {
            previousVersion = current.version;
            previousPhase = current.phase;
          }

          const decision = decideRoomAcceptance(current, nextRoom);
          accepted = decision.accept;
          reason = decision.reason;
          details = decision.details;

          return decision.accept ? nextRoom : current ?? nextRoom;
        });

        if (!accepted) {
          ignoredStaleStateCountRef.current += 1;
          emitHostDebug({
            level: "warning",
            event: "stale_state_ignored",
            reason,
            details,
            previousVersion,
            incomingVersion: nextRoom.version,
            previousPhase,
            incomingPhase: nextRoom.phase,
            ignoredStaleStateCount: ignoredStaleStateCountRef.current,
          });
        } else {
          lastAcceptedVersionRef.current = nextRoom.version;
          currentMatchIdRef.current = nextRoom.currentMatchId;
          emitHostDebug({
            roomVersion: nextRoom.version,
            lastAcceptedRoomVersion: nextRoom.version,
            ignoredStaleStateCount: ignoredStaleStateCountRef.current,
            tickDriver: nextRoom.players.player1?.playerId ?? nextRoom.players.player2?.playerId ?? null,
            phase: nextRoom.phase,
            currentMatchId: nextRoom.currentMatchId,
          });
        }

        if (!cancelled) {
          setError(null);
        }
      } catch (syncError) {
        if (!cancelled) {
          setError(syncError instanceof Error ? syncError.message : "No se pudo sincronizar la sala.");
        }
      } finally {
        syncInFlightRef.current = false;
      }
    }

    syncRoom();
    const poll = window.setInterval(syncRoom, 450);
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
        if (!BATTLE_MODE_ENABLED) {
          return "Modo battle temporalmente desactivado. Sala en modo solo.";
        }
        return room.players.player2 ? "Duelo listo para comenzar." : "Esperando al segundo jugador.";
      case "countdown":
        return "Preparando la arena.";
      case "question-read":
        return "Lee la pregunta. Las respuestas aparecen en breve.";
      case "question":
        return "Responde antes de que acabe el tiempo.";
      case "answer-lock":
        return "Respuestas cerradas.";
      case "battle-result":
        return "Resultados finales.";
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

  const isShowcasePhase = room?.phase === "battle-result" || room?.phase === "leaderboard";
  const showFullResetScreen = room?.phase === "finished" || room?.phase === "reset";

  if (room && isShowcasePhase) {
    return (
      <section className="mx-auto flex w-full max-w-[1920px] items-center justify-center">
        <div className="glass-panel battle-card app-shell aspect-[16/9] w-full overflow-hidden rounded-[2.6rem] p-8 xl:p-10">
          <div className="hero-mesh" />
          <div className="relative flex h-full flex-col">
            {room.phase === "battle-result" ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="font-display text-base uppercase tracking-[0.5em] text-[color:var(--accent-strong)]">
                  Resultado oficial
                </p>
                <h2 className="font-display mt-6 text-7xl font-black uppercase leading-[0.92] xl:text-[8.8rem]">
                  {room.mode === "battle"
                    ? room.battleResult.winner === "player1"
                      ? room.players.player1?.name ?? "Jugador 1"
                      : room.battleResult.winner === "player2"
                        ? room.players.player2?.name ?? "Jugador 2"
                        : "Empate"
                    : room.players.player1?.name ?? "Jugador"}
                </h2>
                <div className="mt-8 grid w-full max-w-6xl gap-4 xl:grid-cols-2">
                  <div className="rounded-[1.9rem] border border-white/15 bg-white/6 px-7 py-7 text-left">
                    <p className="text-xs uppercase tracking-[0.38em] text-[color:var(--muted)]">Jugador 1</p>
                    <p className="font-display mt-4 text-4xl font-black uppercase">{room.players.player1?.name ?? "—"}</p>
                    <div className="mt-5 flex items-end justify-between gap-6">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Puntuación</p>
                        <p className="font-display mt-2 text-6xl font-black text-[color:var(--accent)]">{room.scores.player1}/10</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Promedio</p>
                        <p className="font-display mt-2 text-5xl font-black text-[color:var(--foreground)]">
                          {formatAverageSeconds(room.players.player1?.matchAverageResponseMs)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {room.mode === "battle" && room.players.player2 ? (
                    <div className="rounded-[1.9rem] border border-white/15 bg-white/6 px-7 py-7 text-left">
                      <p className="text-xs uppercase tracking-[0.38em] text-[color:var(--muted)]">Jugador 2</p>
                      <p className="font-display mt-4 text-4xl font-black uppercase">{room.players.player2.name}</p>
                      <div className="mt-5 flex items-end justify-between gap-6">
                        <div>
                          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Puntuación</p>
                          <p className="font-display mt-2 text-6xl font-black text-[color:var(--accent)]">{room.scores.player2}/10</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Promedio</p>
                          <p className="font-display mt-2 text-5xl font-black text-[color:var(--foreground)]">
                            {formatAverageSeconds(room.players.player2.matchAverageResponseMs)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {room.phase === "leaderboard" ? (
              <div className="flex h-full flex-col">
                <div className="text-center">
                  <p className="font-display text-base uppercase tracking-[0.55em] text-[color:var(--accent)]">Leaderboard</p>
                  <h2 className="font-display mt-4 text-7xl font-black uppercase xl:text-[9rem]">Top jugadores</h2>
                </div>
                <div className="mt-8 grid flex-1 gap-8 xl:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-4">
                    <div className="rounded-[1.8rem] border border-white/15 bg-white/6 p-6">
                      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Jugador 1</p>
                      <p className="font-display mt-3 text-4xl font-black uppercase">{room.players.player1?.name ?? "—"}</p>
                      <p className="mt-4 text-sm uppercase tracking-[0.35em] text-[color:var(--muted)]">Puntuación final</p>
                      <p className="font-display mt-1 text-6xl font-black text-[color:var(--accent)]">{room.scores.player1}/10</p>
                    </div>
                    {room.mode === "battle" && room.players.player2 ? (
                      <div className="rounded-[1.8rem] border border-white/15 bg-white/6 p-6">
                        <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Jugador 2</p>
                        <p className="font-display mt-3 text-4xl font-black uppercase">{room.players.player2.name}</p>
                        <p className="mt-4 text-sm uppercase tracking-[0.35em] text-[color:var(--muted)]">Puntuación final</p>
                        <p className="font-display mt-1 text-6xl font-black text-[color:var(--accent)]">{room.scores.player2}/10</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[2rem] border border-white/15 bg-[linear-gradient(180deg,rgba(7,14,28,0.78),rgba(9,16,34,0.96))] p-6">
                    <LeaderboardList
                      entries={room.leaderboard.visibleTop}
                      highlightRanks={leaderboardHighlightRanks}
                      variant="dramatic"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (room && showFullResetScreen) {
    return (
      <section className="mx-auto flex w-full max-w-[1920px] items-center justify-center">
        <div className="app-shell aspect-[16/9] w-full overflow-hidden rounded-[2.6rem] border border-white/10 bg-black p-8 xl:p-10">
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-display text-sm uppercase tracking-[0.5em] text-[color:var(--accent)]">Siguiente partida</p>
            <h2 className="font-display mt-6 text-6xl font-black uppercase leading-[0.95] xl:text-[8rem]">
              Reiniciando la arena
            </h2>
            <p className="mt-6 max-w-3xl text-lg text-[color:var(--muted)]">
              Estamos preparando una ronda limpia para los próximos jugadores.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (room && showQuestion) {
    const p1Name = room.players.player1?.name ?? "Jugador 1";
    const p1University = room.players.player1?.university ?? room.players.player1?.city ?? "Universidad";
    const p2Name = room.players.player2?.name ?? "Jugador 2";
    const p2University = room.players.player2?.university ?? room.players.player2?.city ?? "Universidad";

    return (
      <section className="mx-auto flex w-full max-w-[1920px] items-center justify-center">
        <div className="glass-panel battle-card app-shell aspect-[16/9] w-full overflow-hidden rounded-[2.6rem] p-6 xl:p-8">
          <div className="hero-mesh" />
          <div className="relative h-full">
            <div className="host-gameplay-topbar absolute inset-x-0 top-0 h-[12%]">
              <div
                className="grid h-full items-center gap-4"
                style={{ gridTemplateColumns: "minmax(18rem,22rem) minmax(0,1fr) minmax(18rem,22rem)" }}
              >
                <BroadcastTopPlayerPanel
                  side="left"
                  slot="P1"
                  name={p1Name}
                  university={p1University}
                  points={room.scores.player1}
                />
                <div className="px-2 text-center">
                  <h1 className="font-display text-5xl font-black uppercase tracking-[0.12em] xl:text-6xl">RETO JUSTAS</h1>
                </div>
                <BroadcastTopPlayerPanel
                  side="right"
                  slot="P2"
                  name={p2Name}
                  university={p2University}
                  points={room.scores.player2}
                />
              </div>
            </div>

            <div className="host-gameplay-main absolute inset-x-0 top-[14%] h-[78%]">
              <div className="mx-auto h-full w-full max-w-[1700px] px-2 xl:px-4">
                <section className="relative h-full overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(5,10,20,0.78),rgba(7,12,24,0.96))] p-6">
                  <div className="absolute right-5 top-5 rounded-[1.3rem] border border-white/10 bg-white/7 px-4 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-[color:var(--muted)]">
                      {room.phase === "question-read" ? "lectura" : "respuesta"}
                    </p>
                    <p
                      className={`font-display mt-2 text-5xl font-black ${room.phase === "question" && Number(timerLabel) <= 5 ? "timer-critical" : ""}`}
                    >
                      {timerLabel}
                    </p>
                  </div>

                  <div className="flex h-full flex-col">
                    <div className="max-w-[94%]">
                      <p className="font-display text-3xl font-black uppercase tracking-[0.08em] text-[color:var(--accent)]">
                        Pregunta {room.currentQuestion.questionIndex}/{room.currentQuestion.totalQuestions}
                      </p>
                      {room.currentQuestion.category ? (
                        <p className="mt-3 font-display text-xl font-black uppercase tracking-[0.18em] text-[color:var(--accent-strong)]">
                          {room.currentQuestion.category}
                        </p>
                      ) : null}
                      <h2 className="font-display mt-6 text-left text-6xl font-black uppercase leading-[1.02] tracking-[0.02em] xl:text-7xl">
                        {room.currentQuestion.prompt}
                      </h2>
                    </div>

                    <div className="mt-auto grid gap-3 pb-1 pt-5 xl:grid-cols-2">
                      {(Object.entries(room.currentQuestion.choices ?? {}) as Array<[string, string]>).map(([key, value]) => (
                        <div
                          className={`rounded-[1.6rem] border px-5 py-4 ${
                            room.phase === "question"
                              ? "border-white/12 bg-white/7"
                              : "border-white/8 bg-white/4 opacity-45"
                          }`}
                          key={key}
                        >
                          <div className="flex items-start gap-3">
                            <p className="font-display min-w-[2.5rem] text-4xl font-black uppercase text-[color:var(--accent-cool)]">{key}</p>
                            <p className="text-2xl font-semibold leading-8">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <footer className="host-gameplay-footer absolute inset-x-0 bottom-0 flex h-[8%] items-center justify-center text-center">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">
                © 2026 Luminar Apps · Desarrollado para Municipio Autónomo de Mayagüez
              </p>
            </footer>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[1920px] items-center justify-center">
      <div className="glass-panel battle-card app-shell aspect-[16/9] w-full overflow-hidden rounded-[2.6rem] p-6 xl:p-8">
        <div className="hero-mesh" />
        {leftGlow ? <div className={`pointer-events-none absolute ${leftGlow}`} /> : null}
        {rightGlow ? <div className={`pointer-events-none absolute ${rightGlow}`} /> : null}

        <div className="relative flex h-full flex-col gap-5">
          <header className="flex items-start justify-between gap-6">
            <div className="max-w-5xl">
              <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">Pantalla principal</p>
              <h1 className="font-display mt-3 text-5xl font-black uppercase tracking-[0.12em] xl:text-7xl">
                RETO JUSTAS
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="rounded-full border border-white/12 bg-white/7 px-4 py-2 font-display text-xs font-black uppercase tracking-[0.22em] text-[color:var(--accent-cool)]">
                  P1 {room?.players.player1?.name ?? "Esperando"} · {room?.scores.player1 ?? 0} pts
                </p>
                {room?.players.player2 ? (
                  <p className="rounded-full border border-white/12 bg-white/7 px-4 py-2 font-display text-xs font-black uppercase tracking-[0.22em] text-[color:var(--accent-cool)]">
                    P2 {room.players.player2.name} · {room.scores.player2} pts
                  </p>
                ) : null}
              </div>
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
            </div>
          </header>

          <div className="grid flex-1 gap-5 xl:grid-cols-[1.6fr_0.7fr]">
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
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">
                        Pregunta {room.currentQuestion.questionIndex} / {room.currentQuestion.totalQuestions}
                      </p>
                      {room.currentQuestion.category ? (
                        <p className="mt-4 font-display text-xl font-black uppercase tracking-[0.18em] text-[color:var(--accent-strong)]">
                          {room.currentQuestion.category}
                        </p>
                      ) : null}
                      <h2 className="font-display mt-3 text-5xl font-black uppercase leading-[0.98] xl:text-8xl">
                        {room.currentQuestion.prompt}
                      </h2>
                    </div>
                    <div className="rounded-[1.4rem] border border-white/10 bg-white/7 px-4 py-3 text-right">
                      <p className="text-[11px] uppercase tracking-[0.35em] text-[color:var(--muted)]">
                        {room.phase === "question-read" ? "lectura" : "respuesta"}
                      </p>
                      <p
                        className={`font-display mt-2 text-5xl font-black ${room.phase === "question" && Number(timerLabel) <= 5 ? "timer-critical" : ""}`}
                      >
                        {timerLabel}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {(Object.entries(room.currentQuestion.choices ?? {}) as Array<[string, string]>).map(([key, value]) => (
                      <div
                        className={`rounded-[1.6rem] border px-5 py-4 text-lg leading-7 ${
                          room.phase === "question"
                            ? "border-white/12 bg-white/7"
                            : "border-white/8 bg-white/4 opacity-45"
                        }`}
                        key={key}
                      >
                        <p className="font-display text-3xl font-black uppercase text-[color:var(--accent-cool)]">{key}</p>
                        <p className="mt-2 text-xl">{value}</p>
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
                  {room.mode === "solo" ? (
                    <div className={`mt-5 w-full max-w-3xl rounded-[1.8rem] border px-6 py-8 ${getFeedbackCardTone(room.answerFeedback.player1)}`}>
                      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
                        {room.players.player1?.name ?? "Jugador"}
                      </p>
                      <h2 className="font-display mt-4 text-6xl font-black uppercase xl:text-7xl">
                        {getFeedbackLabel(room.answerFeedback.player1)}
                      </h2>
                      <p className="mt-4 text-sm text-[color:var(--muted)]">
                        Tiempo: {formatResponseSeconds(room.answers.player1?.responseTimeMs)} · Puntos: +{room.answers.player1?.awardedPoints ?? 0}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 grid w-full max-w-5xl gap-4 xl:grid-cols-2">
                      <div className={`rounded-[1.8rem] border px-6 py-7 text-left ${getFeedbackCardTone(room.answerFeedback.player1)}`}>
                        <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
                          {room.players.player1?.name ?? "Jugador 1"}
                        </p>
                        <h3 className="font-display mt-3 text-5xl font-black uppercase">{getFeedbackLabel(room.answerFeedback.player1)}</h3>
                        <p className="mt-3 text-sm text-[color:var(--muted)]">
                          Tiempo: {formatResponseSeconds(room.answers.player1?.responseTimeMs)} · Puntos: +{room.answers.player1?.awardedPoints ?? 0}
                        </p>
                      </div>
                      <div className={`rounded-[1.8rem] border px-6 py-7 text-left ${getFeedbackCardTone(room.answerFeedback.player2)}`}>
                        <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
                          {room.players.player2?.name ?? "Jugador 2"}
                        </p>
                        <h3 className="font-display mt-3 text-5xl font-black uppercase">{getFeedbackLabel(room.answerFeedback.player2)}</h3>
                        <p className="mt-3 text-sm text-[color:var(--muted)]">
                          Tiempo: {formatResponseSeconds(room.answers.player2?.responseTimeMs)} · Puntos: +{room.answers.player2?.awardedPoints ?? 0}
                        </p>
                      </div>
                    </div>
                  )}
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
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="glass-panel rounded-[1.7rem] p-5">
                      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Jugador 1</p>
                      <p className="font-display mt-3 text-3xl font-black uppercase">{room.players.player1?.name ?? "—"}</p>
                      <div className="mt-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Puntuación</p>
                          <p className="font-display mt-2 text-5xl font-black text-[color:var(--accent)]">{room.scores.player1}/10</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Promedio</p>
                          <p className="font-display mt-2 text-4xl font-black text-[color:var(--foreground)]">
                            {formatAverageSeconds(room.players.player1?.matchAverageResponseMs)}
                          </p>
                        </div>
                      </div>
                    </div>
                    {room.mode === "battle" && room.players.player2 ? (
                      <div className="glass-panel rounded-[1.7rem] p-5">
                        <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Jugador 2</p>
                        <p className="font-display mt-3 text-3xl font-black uppercase">{room.players.player2.name}</p>
                        <div className="mt-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Puntuación</p>
                            <p className="font-display mt-2 text-5xl font-black text-[color:var(--accent)]">{room.scores.player2}/10</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Promedio</p>
                            <p className="font-display mt-2 text-4xl font-black text-[color:var(--foreground)]">
                              {formatAverageSeconds(room.players.player2.matchAverageResponseMs)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <LeaderboardList entries={room.leaderboard.visibleTop} highlightRanks={leaderboardHighlightRanks} />
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
                compact
              />
              <SeatCard
                title="Lado derecho"
                slot="P2"
                playerName={room?.players.player2?.name ?? "Disponible"}
                cityLabel={room?.players.player2?.city ?? "Modo duelo opcional"}
                score={room?.scores.player2 ?? 0}
                compact
              />
              {showLobby ? (
                <div className="glass-panel rounded-[1.8rem] p-5">
                  <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Instrucciones visibles</p>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--muted)]">
                    <li>1. Escanea el QR y completa el registro.</li>
                    <li>2. Lee la pregunta durante 5 segundos.</li>
                    <li>3. Cuando aparezcan las respuestas, tendrás 10 segundos para contestar.</li>
                    <li>4. Gana quien acierte más rápido.</li>
                  </ul>
                </div>
              ) : null}
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
