"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { RoomState } from "@/lib/types/game";
import { registrationSchema } from "@/lib/validation/registration";

interface PlayerRoomClientProps {
  roomCode: string;
}

interface PlayerSession {
  playerId: string;
  name: string;
  city: string;
  email: string;
  controllerToken: string;
  sessionId: string;
  instructionsDismissed: boolean;
}

interface FormState {
  name: string;
  city: string;
  age: string;
  email: string;
  acceptedTerms: boolean;
  newsletterOptIn: boolean;
}

const initialFormState: FormState = {
  name: "",
  city: "",
  age: "",
  email: "",
  acceptedTerms: false,
  newsletterOptIn: false,
};

function storageKey(roomCode: string) {
  return `trivia:player:${roomCode}`;
}

export function PlayerRoomClient({ roomCode }: PlayerRoomClientProps) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [session, setSession] = useState<PlayerSession | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(storageKey(roomCode));

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as PlayerSession;
    } catch {
      window.localStorage.removeItem(storageKey(roomCode));
      return null;
    }
  });
  const [selectedChoiceState, setSelectedChoiceState] = useState<{ questionIndex: number; choice: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function refreshRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomCode}/state`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message ?? "Unable to load room.");
        }

        if (!cancelled) {
          setRoom(payload.data.room as RoomState);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : "Unable to load room.");
        }
      }
    }

    refreshRoom();
    const poll = window.setInterval(refreshRoom, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [roomCode]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetch(`/api/rooms/${roomCode}/presence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorType: "player",
          actorId: session.playerId,
          token: session.controllerToken,
        }),
      });
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [roomCode, session]);

  const validation = useMemo(() => {
    const numericAge = Number(form.age);

    return registrationSchema.safeParse({
      roomCode,
      name: form.name,
      city: form.city,
      age: Number.isFinite(numericAge) ? numericAge : Number.NaN,
      email: form.email,
      acceptedTerms: form.acceptedTerms,
      newsletterOptIn: form.newsletterOptIn,
    });
  }, [form, roomCode]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function persistSession(nextSession: PlayerSession) {
    localStorage.setItem(storageKey(roomCode), JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Check your registration details.");
      return;
    }

    startTransition(async () => {
      try {
        const registrationResponse = await fetch("/api/registrations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validation.data),
        });
        const registrationPayload = await registrationResponse.json();

        if (!registrationResponse.ok || !registrationPayload.ok) {
          throw new Error(registrationPayload.message ?? "Unable to save registration.");
        }

        const sessionId = crypto.randomUUID();
        const joinResponse = await fetch(`/api/rooms/${roomCode}/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            playerId: registrationPayload.data.player.playerId,
            sessionId,
          }),
        });
        const joinPayload = await joinResponse.json();

        if (!joinResponse.ok || !joinPayload.ok) {
          throw new Error(joinPayload.message ?? "Unable to join room.");
        }

        const nextSession: PlayerSession = {
          playerId: joinPayload.data.player.playerId,
          name: joinPayload.data.player.name,
          city: joinPayload.data.player.city,
          email: registrationPayload.data.player.email,
          controllerToken: joinPayload.data.player.controllerToken,
          sessionId,
          instructionsDismissed: false,
        };

        persistSession(nextSession);
        setError(null);
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Unable to join room.");
      }
    });
  }

  function dismissInstructions() {
    if (!session) {
      return;
    }

    const nextSession = {
      ...session,
      instructionsDismissed: true,
    };

    persistSession(nextSession);
  }

  async function submitAnswer(choice: "A" | "B" | "C" | "D") {
    if (!session || !room?.currentQuestion.questionId) {
      return;
    }

    setSelectedChoiceState({
      questionIndex: room.currentQuestion.questionIndex,
      choice,
    });
    const response = await fetch(`/api/rooms/${roomCode}/answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playerId: session.playerId,
        controllerToken: session.controllerToken,
        questionId: room.currentQuestion.questionId,
        questionIndex: room.currentQuestion.questionIndex,
        selectedChoice: choice,
      }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      setError(payload.message ?? "Unable to submit answer.");
      setSelectedChoiceState(null);
    }
  }

  const selectedChoice =
    selectedChoiceState && selectedChoiceState.questionIndex === room?.currentQuestion.questionIndex
      ? selectedChoiceState.choice
      : null;

  if (!session) {
    return (
      <form className="flex h-full flex-col gap-5" onSubmit={submitRegistration}>
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">Registration</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight">Join {roomCode}</h1>
          <p className="mt-3 text-base leading-7 text-[color:var(--muted)]">
            Enter your details to claim a seat in this room.
          </p>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">Name</span>
          <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3" onChange={(event) => updateField("name", event.target.value)} value={form.name} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">City</span>
          <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3" onChange={(event) => updateField("city", event.target.value)} value={form.city} />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">Age</span>
            <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3" inputMode="numeric" onChange={(event) => updateField("age", event.target.value)} value={form.age} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">Email</span>
            <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3" onChange={(event) => updateField("email", event.target.value)} type="email" value={form.email} />
          </label>
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <input checked={form.acceptedTerms} className="mt-1 size-4" onChange={(event) => updateField("acceptedTerms", event.target.checked)} type="checkbox" />
          <span className="text-sm leading-6 text-[color:var(--muted)]">I accept the terms and gameplay rules.</span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <input checked={form.newsletterOptIn} className="mt-1 size-4" onChange={(event) => updateField("newsletterOptIn", event.target.checked)} type="checkbox" />
          <span className="text-sm leading-6 text-[color:var(--muted)]">Send me updates and announcements.</span>
        </label>
        {error ? <div className="rounded-2xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
        <button
          className="mt-auto rounded-2xl px-5 py-4 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!validation.success || isPending}
          style={{
            background: !validation.success || isPending ? "rgba(255,255,255,0.08)" : "var(--accent)",
            color: !validation.success || isPending ? "var(--muted)" : "#08111f",
          }}
          type="submit"
        >
          {isPending ? "Joining..." : "Continue"}
        </button>
      </form>
    );
  }

  if (!session.instructionsDismissed && (room?.phase === "idle" || room?.phase === "lobby" || room?.phase === "instructions")) {
    return (
      <section className="flex h-full flex-col justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Instructions</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight">You are in, {session.name}.</h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-[color:var(--muted)]">
            <p>Answer fast. Correct answers score more if you answer earlier.</p>
            <p>You get 15 seconds per question.</p>
            <p>Missing too many questions in a row can reset the match.</p>
          </div>
        </div>
        <button className="mt-8 rounded-2xl bg-[color:var(--accent)] px-5 py-4 text-base font-bold text-slate-950 transition hover:brightness-105" onClick={dismissInstructions} type="button">
          Continue to Lobby
        </button>
      </section>
    );
  }

  if (!room || room.phase === "idle" || room.phase === "lobby" || room.phase === "instructions") {
    return (
      <section className="flex h-full flex-col justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">Lobby</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight">
            {room?.players.player2 ? "Both players connected." : "Waiting for Player 2..."}
          </h2>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            The host can start solo if no second player joins. Stay on this screen until the match begins.
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-[color:var(--accent)]">Current Status</p>
          <p className="mt-3 text-2xl font-bold">{session.name}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {room?.players.player1?.name ?? "Player 1"} vs {room?.players.player2?.name ?? "Open slot"}
          </p>
        </div>
      </section>
    );
  }

  if (room.phase === "countdown") {
    return (
      <section className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Countdown</p>
          <h2 className="mt-5 text-7xl font-black">{room.countdown.secondsRemaining ?? "3"}</h2>
        </div>
      </section>
    );
  }

  if (room.phase === "question") {
    const alreadyAnswered = Boolean(
      (room.players.player1?.playerId === session.playerId && room.answers.player1) ||
        (room.players.player2?.playerId === session.playerId && room.answers.player2),
    );

    return (
      <section className="flex h-full flex-col gap-5">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Question {room.currentQuestion.questionIndex}</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight">{room.currentQuestion.prompt}</h2>
        </div>
        <div className="grid flex-1 gap-4">
          {room.currentQuestion.choices
            ? (Object.keys(room.currentQuestion.choices) as Array<"A" | "B" | "C" | "D">).map((choice) => (
                <button
                  className="rounded-3xl border border-white/10 px-6 py-6 text-left text-4xl font-black transition"
                  disabled={alreadyAnswered}
                  key={choice}
                  onClick={() => submitAnswer(choice)}
                  style={{
                    background:
                      selectedChoice === choice ? "var(--accent)" : "rgba(255,255,255,0.06)",
                    color: selectedChoice === choice ? "#08111f" : "white",
                  }}
                  type="button"
                >
                  {choice}
                </button>
              ))
            : null}
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          {alreadyAnswered ? "Answer locked in." : "Tap one answer before time runs out."}
        </p>
      </section>
    );
  }

  if (room.phase === "answer-lock") {
    const warning =
      room.players.player1?.playerId === session.playerId
        ? room.warnings.player1AfkWarningVisible
        : room.warnings.player2AfkWarningVisible;

    return (
      <section className="flex h-full flex-col justify-center gap-6 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Answers Locked</p>
        <h2 className="text-4xl font-black">Stand by for the next question.</h2>
        {warning ? (
          <p className="rounded-2xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            Warning: two unanswered questions in a row.
          </p>
        ) : null}
      </section>
    );
  }

  if (room.phase === "battle-result") {
    return (
      <section className="flex h-full flex-col justify-center gap-6 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">Battle Result</p>
        <h2 className="text-4xl font-black">
          {room.battleResult.winner === "player1"
            ? `${room.players.player1?.name ?? "Player 1"} wins`
            : room.battleResult.winner === "player2"
              ? `${room.players.player2?.name ?? "Player 2"} wins`
              : "It is a tie"}
        </h2>
      </section>
    );
  }

  if (room.phase === "leaderboard" || room.phase === "finished" || room.phase === "reset") {
    const playerRank =
      room.players.player1?.playerId === session.playerId ? room.leaderboard.player1Rank : room.leaderboard.player2Rank;

    return (
      <section className="flex h-full flex-col gap-5">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Leaderboard</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight">Match complete</h2>
        </div>
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
        {playerRank ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[color:var(--muted)]">
            Your overall rank: <span className="font-bold text-white">#{playerRank}</span>
          </p>
        ) : null}
      </section>
    );
  }

  return null;
}
