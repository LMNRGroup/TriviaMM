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
  const [selectedChoiceState, setSelectedChoiceState] = useState<{
    questionIndex: number;
    choice: string;
  } | null>(null);
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

  const selectedChoice =
    selectedChoiceState && selectedChoiceState.questionIndex === room?.currentQuestion.questionIndex
      ? selectedChoiceState.choice
      : null;

  const playerSeat = room
    ? room.players.player1?.playerId === session?.playerId
      ? room.players.player1
      : room.players.player2?.playerId === session?.playerId
        ? room.players.player2
        : null
    : null;

  const playerWarning =
    playerSeat?.slot === 1
      ? room?.warnings.player1AfkWarningVisible
      : room?.warnings.player2AfkWarningVisible;

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

  function dismissInstructions() {
    if (!session) {
      return;
    }

    persistSession({
      ...session,
      instructionsDismissed: true,
    });
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

        persistSession({
          playerId: joinPayload.data.player.playerId,
          name: joinPayload.data.player.name,
          city: joinPayload.data.player.city,
          email: registrationPayload.data.player.email,
          controllerToken: joinPayload.data.player.controllerToken,
          sessionId,
          instructionsDismissed: false,
        });
        setError(null);
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Unable to join room.");
      }
    });
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

  if (!session) {
    return (
      <form className="enter-rise flex h-full flex-col gap-5" onSubmit={submitRegistration}>
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
            Registration
          </p>
          <h1 className="font-display mt-4 text-4xl font-black uppercase tracking-[0.08em]">
            Join {roomCode}
          </h1>
          <p className="mt-3 text-base leading-7 text-[color:var(--muted)]">
            Claim your seat. Clean entry, clear rules, then straight into the arena.
          </p>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">Name</span>
          <input
            className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
            onChange={(event) => updateField("name", event.target.value)}
            value={form.name}
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">City</span>
          <input
            className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
            onChange={(event) => updateField("city", event.target.value)}
            value={form.city}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">Age</span>
            <input
              className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
              inputMode="numeric"
              onChange={(event) => updateField("age", event.target.value)}
              value={form.age}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">Email</span>
            <input
              className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
              onChange={(event) => updateField("email", event.target.value)}
              type="email"
              value={form.email}
            />
          </label>
        </div>

        <label className="rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/7">
          <div className="flex items-start gap-3">
            <input
              checked={form.acceptedTerms}
              className="mt-1 size-4"
              onChange={(event) => updateField("acceptedTerms", event.target.checked)}
              type="checkbox"
            />
            <span className="text-sm leading-6 text-[color:var(--muted)]">
              I accept the terms and gameplay rules.
            </span>
          </div>
        </label>

        <label className="rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/7">
          <div className="flex items-start gap-3">
            <input
              checked={form.newsletterOptIn}
              className="mt-1 size-4"
              onChange={(event) => updateField("newsletterOptIn", event.target.checked)}
              type="checkbox"
            />
            <span className="text-sm leading-6 text-[color:var(--muted)]">
              Send me updates and announcements.
            </span>
          </div>
        </label>

        {error ? (
          <div className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <button
          className="font-display mt-auto rounded-[1.45rem] px-5 py-4 text-base font-black uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40"
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
      <section className="enter-rise flex h-full flex-col justify-between">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
            Instructions
          </p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">
            You are in, {session.name}.
          </h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-[color:var(--muted)]">
            <p>Answer fast. Correct answers score more if you answer earlier.</p>
            <p>You get 15 seconds per question.</p>
            <p>Missing too many questions in a row can reset the match.</p>
          </div>
        </div>

        <button
          className="font-display mt-8 rounded-[1.45rem] bg-[linear-gradient(135deg,var(--accent),#ffd976)] px-5 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105"
          onClick={dismissInstructions}
          type="button"
        >
          Continue To Lobby
        </button>
      </section>
    );
  }

  if (!room || room.phase === "idle" || room.phase === "lobby" || room.phase === "instructions") {
    return (
      <section className="enter-rise flex h-full flex-col justify-between">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
            Lobby
          </p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">
            {room?.players.player2 ? "Both Players Connected." : "Waiting For Player 2..."}
          </h2>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            The host can start solo if no second player joins. Stay on this screen until the match begins.
          </p>
        </div>

        <div className="glass-panel battle-card rounded-[1.8rem] p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-[color:var(--accent)]">Current Status</p>
          <p className="font-display mt-3 text-2xl font-black uppercase">{session.name}</p>
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
        <div className="enter-scale text-center">
          <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">
            Countdown
          </p>
          <h2 className="font-display mt-5 text-8xl font-black uppercase">
            {room.countdown.secondsRemaining ?? "3"}
          </h2>
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
      <section className="enter-rise flex h-full flex-col gap-5">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
            Question {room.currentQuestion.questionIndex}
          </p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.06em]">
            {room.currentQuestion.prompt}
          </h2>
        </div>

        <div className="grid flex-1 gap-4">
          {room.currentQuestion.choices
            ? (Object.keys(room.currentQuestion.choices) as Array<"A" | "B" | "C" | "D">).map((choice) => (
                <button
                  className="font-display rounded-[1.8rem] border border-white/10 px-6 py-7 text-left text-5xl font-black uppercase tracking-[0.08em] transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed"
                  disabled={alreadyAnswered}
                  key={choice}
                  onClick={() => submitAnswer(choice)}
                  style={{
                    background:
                      selectedChoice === choice
                        ? "linear-gradient(135deg,var(--accent),#ffd976)"
                        : "rgba(255,255,255,0.06)",
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
    return (
      <section className="enter-scale flex h-full flex-col justify-center gap-6 text-center">
        <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
          Answers Locked
        </p>
        <h2 className="font-display text-4xl font-black uppercase tracking-[0.08em]">
          Stand By For The Next Clash.
        </h2>
        {playerWarning ? (
          <p className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            Warning: two unanswered questions in a row.
          </p>
        ) : null}
      </section>
    );
  }

  if (room.phase === "battle-result") {
    return (
      <section className="enter-scale flex h-full flex-col justify-center gap-6 text-center">
        <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
          Battle Result
        </p>
        <h2 className="font-display text-4xl font-black uppercase tracking-[0.08em]">
          {room.battleResult.winner === "player1"
            ? `${room.players.player1?.name ?? "Player 1"} wins`
            : room.battleResult.winner === "player2"
              ? `${room.players.player2?.name ?? "Player 2"} wins`
              : "It Is A Tie"}
        </h2>
      </section>
    );
  }

  if (room.phase === "leaderboard" || room.phase === "finished" || room.phase === "reset") {
    const playerRank =
      room.players.player1?.playerId === session.playerId
        ? room.leaderboard.player1Rank
        : room.leaderboard.player2Rank;

    return (
      <section className="enter-rise flex h-full flex-col gap-5">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
            Leaderboard
          </p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">
            Match Complete
          </h2>
        </div>

        <div className="space-y-3">
          {room.leaderboard.visibleTop.map((entry, index) => (
            <div
              className="glass-panel battle-card enter-scale flex items-center justify-between rounded-[1.6rem] px-5 py-4"
              key={entry.playerId}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div>
                <p className="text-lg font-bold">
                  {entry.rank}. {entry.playerName}
                </p>
                <p className="text-sm text-[color:var(--muted)]">{entry.city}</p>
              </div>
              <p className="font-display text-xl font-black text-[color:var(--accent)]">
                {entry.lifetimePoints}
              </p>
            </div>
          ))}
        </div>

        {playerRank ? (
          <p className="rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-[color:var(--muted)]">
            Your overall rank: <span className="font-bold text-white">#{playerRank}</span>
          </p>
        ) : null}
      </section>
    );
  }

  return null;
}
