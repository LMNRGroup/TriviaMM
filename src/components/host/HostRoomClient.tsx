"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { RoomState } from "@/lib/types/game";

interface HostRoomClientProps {
  roomCode: string;
}

interface HostSession {
  hostToken: string;
  hostSessionId: string;
}

function useCountdown(endsAt: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  if (!endsAt) {
    return 0;
  }

  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
}

export function HostRoomClient({ roomCode }: HostRoomClientProps) {
  const [session] = useState<HostSession | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(`trivia:host:${roomCode}`);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as HostSession;
    } catch {
      return null;
    }
  });
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const questionCountdown = useCountdown(
    room?.phase === "question" ? room.currentQuestion.endsAt : room?.countdown.endsAt ?? null,
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;
    const { hostToken, hostSessionId } = session;

    async function refreshState() {
      try {
        const stateResponse = await fetch(`/api/rooms/${roomCode}/state`, {
          cache: "no-store",
        });
        const statePayload = await stateResponse.json();

        if (!stateResponse.ok || !statePayload.ok) {
          throw new Error(statePayload.message ?? "Unable to load room.");
        }

        if (!cancelled) {
          setRoom(statePayload.data.room as RoomState);
        }

        if (
          !cancelled &&
          ["instructions", "countdown", "question", "answer-lock", "battle-result", "leaderboard", "finished", "reset"].includes(
            (statePayload.data.room as RoomState).phase,
          )
        ) {
          const tickResponse = await fetch(`/api/rooms/${roomCode}/tick`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              hostToken,
            }),
          });
          const tickPayload = await tickResponse.json();

          if (tickResponse.ok && tickPayload.ok && !cancelled) {
            setRoom(tickPayload.data.room as RoomState);
          }
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh room.");
        }
      }
    }

    refreshState();
    const poll = window.setInterval(refreshState, 1000);
    const presence = window.setInterval(() => {
      void fetch(`/api/rooms/${roomCode}/presence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorType: "host",
          actorId: hostSessionId,
          token: hostToken,
        }),
      });
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(presence);
    };
  }, [roomCode, session]);

  async function resetRoom() {
    if (!session) {
      return;
    }

    const response = await fetch(`/api/rooms/${roomCode}/reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hostToken: session.hostToken,
        reason: "host_reset",
      }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      setError(payload.message ?? "Unable to reset room.");
      return;
    }

    setRoom(payload.data.room as RoomState);
  }

  async function startRoom(mode: "solo" | "battle") {
    if (!session) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/rooms/${roomCode}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hostToken: session.hostToken,
          mode,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(payload.message ?? "Unable to start room.");
        return;
      }

      setRoom(payload.data.room as RoomState);
    });
  }

  const canStartSolo =
    Boolean(room?.players.player1) &&
    !room?.players.player2 &&
    (room?.phase === "idle" || room?.phase === "lobby");
  const canStartBattle =
    Boolean(room?.players.player1 && room?.players.player2) &&
    (room?.phase === "idle" || room?.phase === "lobby");
  const phaseLabel = room?.phase.replace("-", " ").toUpperCase() ?? "CONNECTING";
  const isQuestionPhase = room?.phase === "question";
  const isTimerCritical = questionCountdown <= 5 && questionCountdown > 0;

  const statusCopy = useMemo(() => {
    if (!room) {
      return "Loading room state...";
    }

    switch (room.phase) {
      case "idle":
      case "lobby":
        return "Scan the QR code to pull players into the room.";
      case "instructions":
        return "Players are reading the pre-match rules.";
      case "countdown":
        return "The arena is counting down to the next clash.";
      case "question":
        return `Question ${room.currentQuestion.questionIndex} of ${room.currentQuestion.totalQuestions}`;
      case "answer-lock":
        return "Answers are locked. Results are processing.";
      case "battle-result":
        return "Battle result on screen.";
      case "leaderboard":
        return "Leaderboard on screen.";
      case "finished":
      case "reset":
        return "Cycling the room back to ready state.";
      default:
        return room.phase;
    }
  }, [room]);

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-6 xl:grid-cols-[1.24fr_0.76fr]">
      <section className="glass-panel battle-card app-shell overflow-hidden rounded-[2.4rem] p-6 sm:p-8">
        <div className="hero-mesh" />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">
              Host Arena
            </p>
            <h1 className="font-display mt-3 text-5xl font-black uppercase tracking-[0.14em] sm:text-7xl">
              {roomCode}
            </h1>
            <p className="status-dot mt-4 max-w-2xl text-base leading-8 text-[color:var(--muted)]">
              {statusCopy}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
              {phaseLabel}
            </div>
            <button
              className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-[color:var(--accent)] hover:bg-white/8"
              onClick={resetRoom}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-8 min-h-[42rem] rounded-[2.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(5,10,20,0.76),rgba(7,12,24,0.95))] p-6 sm:p-8">
          {isQuestionPhase ? (
            <div className="enter-rise space-y-8">
              <div className="flex items-center justify-between gap-4">
                <span className="font-display rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--panel-soft)] px-5 py-2 text-sm uppercase tracking-[0.32em] text-[color:var(--accent)]">
                  Live Question
                </span>
                <span
                  className={`font-display text-5xl font-black uppercase tracking-[0.08em] ${
                    isTimerCritical ? "timer-critical" : "text-[color:var(--accent)]"
                  }`}
                >
                  {questionCountdown}s
                </span>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/5 px-6 py-5">
                <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-strong))] transition-all duration-300 ${
                      isTimerCritical ? "animate-pulse" : ""
                    }`}
                    style={{ width: `${Math.max(8, (questionCountdown / 15) * 100)}%` }}
                  />
                </div>

                <h2 className="font-display max-w-5xl text-4xl font-black uppercase leading-tight tracking-[0.04em] sm:text-6xl">
                  {room.currentQuestion.prompt}
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {room.currentQuestion.choices
                  ? (Object.entries(room.currentQuestion.choices) as Array<[string, string]>).map(
                      ([key, value], index) => (
                        <div
                          className="glass-panel battle-card enter-scale rounded-[1.75rem] p-5"
                          key={key}
                          style={{ animationDelay: `${index * 60}ms` }}
                        >
                          <p className="font-display text-sm uppercase tracking-[0.4em] text-[color:var(--accent-cool)]">
                            {key}
                          </p>
                          <p className="mt-3 text-xl font-semibold leading-8">{value}</p>
                        </div>
                      ),
                    )
                  : null}
              </div>
            </div>
          ) : room?.phase === "battle-result" ? (
            <div className="enter-scale flex min-h-[34rem] items-center justify-center">
              <div className="space-y-8 text-center">
                <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent-strong)]">
                  Battle Result
                </p>
                <h2 className="font-display max-w-4xl text-5xl font-black uppercase leading-[0.95] tracking-[0.08em] sm:text-7xl">
                  {room.battleResult.winner === "player1"
                    ? `${room.players.player1?.name ?? "Player 1"} defeats ${room.players.player2?.name ?? "Player 2"}`
                    : room.battleResult.winner === "player2"
                      ? `${room.players.player2?.name ?? "Player 2"} defeats ${room.players.player1?.name ?? "Player 1"}`
                      : "Dead Heat"}
                </h2>
                <p className="text-lg leading-8 text-[color:var(--muted)]">
                  Ten seconds of glory before the rankings drop.
                </p>
              </div>
            </div>
          ) : room?.phase === "leaderboard" ? (
            <div className="enter-rise space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-display text-sm uppercase tracking-[0.4em] text-[color:var(--accent)]">
                    Leaderboard
                  </p>
                  <h2 className="font-display mt-3 text-4xl font-black uppercase tracking-[0.08em] sm:text-5xl">
                    Top Players
                  </h2>
                </div>
                <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--muted)]">
                  Lifetime Points
                </p>
              </div>

              <div className="space-y-3">
                {room.leaderboard.visibleTop.map((entry, index) => (
                  <div
                    className="glass-panel battle-card enter-scale flex items-center justify-between rounded-[1.6rem] px-5 py-4"
                    key={entry.playerId}
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="font-display flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--accent),#ffe08d)] text-lg font-black text-slate-950">
                        {entry.rank}
                      </div>
                      <div>
                        <p className="text-lg font-bold">{entry.playerName}</p>
                        <p className="text-sm text-[color:var(--muted)]">{entry.city}</p>
                      </div>
                    </div>
                    <p className="font-display text-2xl font-black text-[color:var(--accent)]">
                      {entry.lifetimePoints}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[34rem] items-center justify-center">
              <div className="enter-scale space-y-8 text-center">
                <div className="pulse-ring mx-auto flex w-fit rounded-[2rem] bg-white p-4 shadow-[0_20px_60px_rgba(248,193,78,0.18)]">
                  {room?.qrUrl ? <QRCodeSVG bgColor="#ffffff" fgColor="#08111f" size={220} value={room.qrUrl} /> : null}
                </div>

                <div className="space-y-3">
                  <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">
                    Scan To Battle
                  </p>
                  <h2 className="font-display text-4xl font-black uppercase tracking-[0.08em] sm:text-6xl">
                    Join The Arena
                  </h2>
                </div>

                <p className="mx-auto max-w-2xl text-base leading-8 text-[color:var(--muted)]">
                  Players scan the code, register on their phones, and enter a live match flow built to feel fast, tense, and rewarding.
                </p>

                <div className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-[color:var(--muted)]">
                  {room?.qrUrl ?? `.../play/${roomCode}`}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6">
        <section className="glass-panel battle-card rounded-[2rem] p-6">
          <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">
            Player Grid
          </p>
          <div className="mt-5 space-y-3">
            {[room?.players.player1, room?.players.player2].map((player, index) => (
              <div
                className={`rounded-[1.6rem] border p-4 transition ${
                  player ? "border-[color:var(--accent)]/20 bg-white/6" : "border-white/10 bg-white/5"
                }`}
                key={index}
              >
                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
                  Seat {index + 1}
                </p>
                <p className="font-display mt-2 text-2xl font-black uppercase tracking-[0.05em]">
                  {player?.name ?? "Open Slot"}
                </p>
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  {player?.city ?? "Waiting for challenger..."}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel battle-card rounded-[2rem] p-6">
          <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">
            Controls
          </p>
          <div className="mt-5 grid gap-3">
            <button
              className="font-display rounded-[1.4rem] bg-[linear-gradient(135deg,var(--accent),#ffdf8a)] px-4 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canStartSolo || isPending}
              onClick={() => startRoom("solo")}
              type="button"
            >
              Solo Run
            </button>
            <button
              className="font-display rounded-[1.4rem] bg-[linear-gradient(135deg,var(--accent-strong),#ffae7f)] px-4 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canStartBattle || isPending}
              onClick={() => startRoom("battle")}
              type="button"
            >
              Start Battle
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
          {!session ? (
            <p className="mt-4 text-sm text-red-200">
              No host session found for this room. Create a room from the home screen.
            </p>
          ) : null}
        </section>

        <section className="glass-panel battle-card rounded-[2rem] p-6">
          <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent-cool)]">
            Scoreboard
          </p>
          <div className="mt-5 space-y-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  {room?.players.player1?.name ?? "Player 1"}
                </span>
                <strong className="font-display text-3xl text-[color:var(--accent)]">
                  {room?.scores.player1 ?? 0}
                </strong>
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  {room?.players.player2?.name ?? "Player 2"}
                </span>
                <strong className="font-display text-3xl text-[color:var(--accent-cool)]">
                  {room?.scores.player2 ?? 0}
                </strong>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
