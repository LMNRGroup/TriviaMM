"use client";

import { useMemo, useState, useTransition } from "react";
import { registrationSchema } from "@/lib/validation/registration";

interface RegistrationFlowProps {
  roomCode: string;
}

interface RegisteredPlayer {
  playerId: string;
  name: string;
  city: string;
  email: string;
}

type FlowStep = "register" | "instructions" | "lobby";

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

function createSessionId() {
  return crypto.randomUUID();
}

export function RegistrationFlow({ roomCode }: RegistrationFlowProps) {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [registeredPlayer, setRegisteredPlayer] = useState<RegisteredPlayer | null>(null);
  const [step, setStep] = useState<FlowStep>("register");
  const [isPending, startTransition] = useTransition();

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

  const continueDisabled = !validation.success || isPending;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Check your registration details.");
      return;
    }

    setError(null);

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

        const player = registrationPayload.data.player as RegisteredPlayer;
        const joinResponse = await fetch(`/api/rooms/${roomCode}/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            playerId: player.playerId,
            sessionId: createSessionId(),
          }),
        });

        const joinPayload = await joinResponse.json();

        if (!joinResponse.ok || !joinPayload.ok) {
          throw new Error(joinPayload.message ?? "Unable to join room.");
        }

        setRegisteredPlayer(player);
        setStep("instructions");
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Something went wrong while joining the room.",
        );
      }
    });
  }

  if (step === "instructions" && registeredPlayer) {
    return (
      <section className="flex h-full flex-col justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">
            Instructions
          </p>
          <h2 className="mt-4 text-3xl font-black tracking-tight">
            You are in, {registeredPlayer.name}.
          </h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-[color:var(--muted)]">
            <p>Answer as fast as you can. Correct answers score more when you respond earlier.</p>
            <p>You get 15 seconds per question. Missing too many questions in a row can reset the match.</p>
            <p>The phone shows oversized A/B/C/D controls during live play.</p>
          </div>
        </div>

        <button
          className="mt-8 rounded-2xl bg-[color:var(--accent)] px-5 py-4 text-base font-bold text-slate-950 transition hover:brightness-105"
          onClick={() => setStep("lobby")}
          type="button"
        >
          Continue to Lobby
        </button>
      </section>
    );
  }

  if (step === "lobby" && registeredPlayer) {
    return (
      <section className="flex h-full flex-col justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">
            Lobby
          </p>
          <h2 className="mt-4 text-3xl font-black tracking-tight">Waiting for Player 2...</h2>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            {registeredPlayer.name}, your registration is saved and your seat is claimed. The live
            room poller and solo-start controls are the next step.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-[color:var(--accent)]">
            Current Player
          </p>
          <p className="mt-3 text-2xl font-bold">{registeredPlayer.name}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {registeredPlayer.city} · {registeredPlayer.email}
          </p>
        </div>
      </section>
    );
  }

  return (
    <form className="flex h-full flex-col gap-5" onSubmit={submitRegistration}>
      <div>
        <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">
          Registration
        </p>
        <h2 className="mt-4 text-3xl font-black tracking-tight">Enter the battle.</h2>
        <p className="mt-3 text-base leading-7 text-[color:var(--muted)]">
          Join room {roomCode}. Required fields must be valid, and terms must be accepted before
          you can continue.
        </p>
      </div>

      <label className="space-y-2">
        <span className="text-sm font-semibold text-white">Name</span>
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none ring-0 transition focus:border-[color:var(--accent)]"
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Your name"
          value={form.name}
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-semibold text-white">City</span>
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none ring-0 transition focus:border-[color:var(--accent)]"
          onChange={(event) => updateField("city", event.target.value)}
          placeholder="City"
          value={form.city}
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">Age</span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none ring-0 transition focus:border-[color:var(--accent)]"
            inputMode="numeric"
            onChange={(event) => updateField("age", event.target.value)}
            placeholder="18"
            value={form.age}
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">Email</span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none ring-0 transition focus:border-[color:var(--accent)]"
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="you@example.com"
            type="email"
            value={form.email}
          />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <input
          checked={form.acceptedTerms}
          className="mt-1 size-4"
          onChange={(event) => updateField("acceptedTerms", event.target.checked)}
          type="checkbox"
        />
        <span className="text-sm leading-6 text-[color:var(--muted)]">
          I accept the terms and consent to gameplay data being used for match operation.
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <input
          checked={form.newsletterOptIn}
          className="mt-1 size-4"
          onChange={(event) => updateField("newsletterOptIn", event.target.checked)}
          type="checkbox"
        />
        <span className="text-sm leading-6 text-[color:var(--muted)]">
          Send me updates and future event announcements.
        </span>
      </label>

      {error ? (
        <div className="rounded-2xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <button
        className="mt-auto rounded-2xl px-5 py-4 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-40"
        disabled={continueDisabled}
        style={{
          background: continueDisabled ? "rgba(255,255,255,0.08)" : "var(--accent)",
          color: continueDisabled ? "var(--muted)" : "#08111f",
        }}
        type="submit"
      >
        {isPending ? "Joining..." : "Continue"}
      </button>
    </form>
  );
}
