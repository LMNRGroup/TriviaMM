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
  const questionCountdown = useCountdown(room?.phase === "question" ? room.currentQuestion.endsAt : room?.countdown.endsAt ?? null);

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

  const canStartSolo = Boolean(room?.players.player1) && !room?.players.player2 && (room?.phase === "idle" || room?.phase === "lobby");
  const canStartBattle = Boolean(room?.players.player1 && room?.players.player2) && (room?.phase === "idle" || room?.phase === "lobby");

  const statusCopy = useMemo(() => {
    if (!room) {
      return "Loading room state...";
    }

    switch (room.phase) {
      case "idle":
      case "lobby":
        return "Scan the QR code to join the room.";
      case "instructions":
        return "Players are reading instructions.";
      case "countdown":
        return "Get ready.";
      case "question":
        return `Question ${room.currentQuestion.questionIndex} of ${room.currentQuestion.totalQuestions}`;
      case "answer-lock":
        return "Answers locked.";
      case "battle-result":
        return "Battle result on screen.";
      case "leaderboard":
        return "Leaderboard on screen.";
      case "finished":
      case "reset":
        return "Returning to QR screen.";
      default:
        return room.phase;
    }
  }, [room]);

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-8 shadow-2xl shadow-black/40">
        <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Host Room</p>
        <div className="mt-4 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-5xl font-black tracking-tight sm:text-7xl">{roomCode}</h1>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-[color:var(--muted)]">{statusCopy}</p>
          </div>
          <button
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-[color:var(--accent)]"
            onClick={resetRoom}
            type="button"
          >
            Reset
          </button>
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-[color:var(--panel-strong)] p-8">
          {room?.phase === "question" ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full border border-[color:var(--accent)]/40 px-4 py-2 text-sm uppercase tracking-[0.3em] text-[color:var(--accent)]">
                  Live Question
                </span>
                <span className="text-4xl font-black text-[color:var(--accent)]">{questionCountdown}s</span>
              </div>
              <h2 className="max-w-4xl text-4xl font-black leading-tight sm:text-6xl">
                {room.currentQuestion.prompt}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {room.currentQuestion.choices
                  ? (Object.entries(room.currentQuestion.choices) as Array<[string, string]>).map(([key, value]) => (
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5" key={key}>
                        <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">{key}</p>
                        <p className="mt-3 text-xl font-semibold leading-8">{value}</p>
                      </div>
                    ))
                  : null}
              </div>
            </div>
          ) : room?.phase === "battle-result" ? (
            <div className="space-y-6 text-center">
              <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">Battle Result</p>
              <h2 className="text-5xl font-black">
                {room.battleResult.winner === "player1"
                  ? `${room.players.player1?.name ?? "Player 1"} beat ${room.players.player2?.name ?? "Player 2"}`
                  : room.battleResult.winner === "player2"
                    ? `${room.players.player2?.name ?? "Player 2"} beat ${room.players.player1?.name ?? "Player 1"}`
                    : "Tie battle"}
              </h2>
            </div>
          ) : room?.phase === "leaderboard" ? (
            <div className="space-y-6">
              <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Leaderboard</p>
              <div className="space-y-3">
                {room.leaderboard.visibleTop.map((entry) => (
                  <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4" key={entry.playerId}>
                    <div>
                      <p className="text-lg font-bold">{entry.rank}. {entry.playerName}</p>
                      <p className="text-sm text-[color:var(--muted)]">{entry.city}</p>
                    </div>
                    <p className="text-xl font-black text-[color:var(--accent)]">{entry.lifetimePoints}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[24rem] items-center justify-center">
              <div className="space-y-6 text-center">
                {room?.qrUrl ? (
                  <div className="mx-auto flex w-fit rounded-[2rem] bg-white p-4">
                    <QRCodeSVG bgColor="#ffffff" fgColor="#08111f" size={220} value={room.qrUrl} />
                  </div>
                ) : null}
                <p className="text-base leading-7 text-[color:var(--muted)]">
                  Players join at <span className="font-semibold text-white">{room?.qrUrl ?? `.../play/${roomCode}`}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-6">
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Lobby</p>
          <div className="mt-5 space-y-3">
            {[room?.players.player1, room?.players.player2].map((player, index) => (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4" key={index}>
                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">Player {index + 1}</p>
                <p className="mt-2 text-xl font-bold">{player?.name ?? "Open slot"}</p>
                <p className="mt-1 text-sm text-[color:var(--muted)]">{player?.city ?? "Waiting..."}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-6">
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">Controls</p>
          <div className="mt-5 grid gap-3">
            <button
              className="rounded-2xl bg-[color:var(--accent)] px-4 py-4 text-base font-black text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canStartSolo || isPending}
              onClick={() => startRoom("solo")}
              type="button"
            >
              Start Solo
            </button>
            <button
              className="rounded-2xl bg-[color:var(--accent-strong)] px-4 py-4 text-base font-black text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canStartBattle || isPending}
              onClick={() => startRoom("battle")}
              type="button"
            >
              Start Battle
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
          {!session ? (
            <p className="mt-4 text-sm text-red-200">No host session found for this room. Create a room from the home screen.</p>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-6">
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Scores</p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <span>{room?.players.player1?.name ?? "Player 1"}</span>
              <strong>{room?.scores.player1 ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <span>{room?.players.player2?.name ?? "Player 2"}</span>
              <strong>{room?.scores.player2 ?? 0}</strong>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
