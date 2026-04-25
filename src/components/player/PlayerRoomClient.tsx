"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import {
  AGE_OPTIONS,
  COUNTRY_OPTIONS,
  PUERTO_RICO_MUNICIPALITY_OPTIONS,
  US_STATE_AND_TERRITORY_OPTIONS,
} from "@/lib/data/regions";
import type { PublicRoomState, RoomMode } from "@/lib/types/game";
import { registrationSchema } from "@/lib/validation/registration";

interface JoinApiPlayer {
  playerId: string;
  name: string;
  city: string;
  slot: 1 | 2;
  roomCode: string;
  controllerToken: string;
  sessionId: string;
}

interface PlayerSession {
  playerId: string;
  name: string;
  city: string;
  age: number;
  email: string;
  controllerToken: string;
  sessionId: string;
}

interface RememberedPlayer {
  playerId: string;
  name: string;
  city: string;
  age: number;
  /** Same-device hint from server; never part of `PublicRoomState`. */
  email?: string;
}

interface FormState {
  name: string;
  country: string;
  region: string;
  city: string;
  age: string;
  email: string;
  acceptedTerms: boolean;
  newsletterOptIn: boolean;
}

const STORAGE_KEY = "trivia:player:public";

function instructionsStorageKey(playerId: string) {
  return `trivia:instr:${playerId}`;
}

function normalizeStoredSession(raw: unknown): PlayerSession | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const city = typeof data.city === "string" ? data.city : typeof data.country === "string" ? data.country : "";

  if (
    typeof data.playerId !== "string" ||
    typeof data.name !== "string" ||
    typeof data.controllerToken !== "string" ||
    typeof data.sessionId !== "string"
  ) {
    return null;
  }

  return {
    playerId: data.playerId,
    name: data.name,
    city,
    age: typeof data.age === "number" ? data.age : Number(data.age ?? 0),
    email: typeof data.email === "string" ? data.email : "",
    controllerToken: data.controllerToken,
    sessionId: data.sessionId,
  };
}

const initialFormState: FormState = {
  name: "",
  country: "",
  region: "",
  city: "",
  age: "",
  email: "",
  acceptedTerms: false,
  newsletterOptIn: true,
};

function formatSeconds(iso: string | null, now: number, decimals = 0) {
  if (!iso) {
    return decimals > 0 ? `0.${"0".repeat(decimals)}` : "0";
  }

  const remaining = Math.max(0, new Date(iso).getTime() - now) / 1000;
  return remaining.toFixed(decimals);
}

export function PlayerRoomClient() {
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [rememberedPlayer, setRememberedPlayer] = useState<RememberedPlayer | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [session, setSession] = useState<PlayerSession | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      return normalizeStoredSession(JSON.parse(raw));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  });
  const [selectedChoiceState, setSelectedChoiceState] = useState<{ questionIndex: number; choice: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [agePickerOpen, setAgePickerOpen] = useState(false);
  const autoJoinAttempted = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [instructionsBump, setInstructionsBump] = useState(0);

  const regionOptions = useMemo(() => {
    if (form.country === "United States") {
      return US_STATE_AND_TERRITORY_OPTIONS;
    }

    if (form.country === "Puerto Rico") {
      return PUERTO_RICO_MUNICIPALITY_OPTIONS;
    }

    return [];
  }, [form.country]);

  const instructionsAck = useMemo(() => {
    if (!session?.playerId) {
      return true;
    }

    if (typeof window === "undefined") {
      return false;
    }

    void instructionsBump;
    return window.sessionStorage.getItem(instructionsStorageKey(session.playerId)) === "1";
  }, [session?.playerId, instructionsBump]);

  const playerSeat = room
    ? room.players.player1?.playerId === session?.playerId
      ? room.players.player1
      : room.players.player2?.playerId === session?.playerId
        ? room.players.player2
        : null
    : null;

  const selectedChoice =
    selectedChoiceState && selectedChoiceState.questionIndex === room?.currentQuestion.questionIndex
      ? selectedChoiceState.choice
      : null;

  function persistSession(nextSession: PlayerSession | null) {
    if (nextSession) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }

  async function loadRoomState() {
    const response = await fetch("/api/public/state", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message ?? "No se pudo cargar la sala.");
    }

    setRoom(payload.data.room as PublicRoomState);
    setRememberedPlayer((payload.data.rememberedPlayer as RememberedPlayer | null) ?? null);
    setError(null);
    return payload.data.room as PublicRoomState;
  }

  const joinWithPlayer = useCallback(async (playerId: string, profile?: RememberedPlayer) => {
    const sessionId = crypto.randomUUID();
    const response = await fetch("/api/public/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playerId,
        sessionId,
      }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message ?? "No fue posible entrar a la sala.");
    }

    const joinedPlayer = payload.data.player as JoinApiPlayer;
    persistSession({
      playerId: joinedPlayer.playerId,
      name: joinedPlayer.name,
      city: joinedPlayer.city,
      age: Number(profile?.age ?? form.age ?? 0),
      email: profile?.email ?? form.email,
      controllerToken: joinedPlayer.controllerToken,
      sessionId,
    });
  }, [form.age, form.email]);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        const nextRoom = await loadRoomState();

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
      } catch (syncError) {
        if (!cancelled) {
          setError(syncError instanceof Error ? syncError.message : "No se pudo sincronizar la partida.");
        }
      }
    }

    void sync();
    const poll = window.setInterval(() => {
      void sync();
    }, 900);
    const timer = window.setInterval(() => setNow(Date.now()), 100);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const heartbeat = window.setInterval(() => {
      void fetch("/api/public/presence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerId: session.playerId,
          controllerToken: session.controllerToken,
        }),
      });
    }, 10_000);

    return () => window.clearInterval(heartbeat);
  }, [session]);

  useEffect(() => {
    if (!room || !session) {
      return;
    }

    const playerStillInRoom =
      room.players.player1?.playerId === session.playerId || room.players.player2?.playerId === session.playerId;

    if (room.phase === "idle" && room.lobby.previewMessage === "lobby_timeout" && !playerStillInRoom) {
      const timeoutId = window.setTimeout(() => {
        autoJoinAttempted.current = session.playerId;
        persistSession(null);
        setRememberedPlayer(null);
        setError("Tu tiempo en el lobby expiró. Entra de nuevo cuando estés listo.");
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [room, session]);

  useEffect(() => {
    if (!room || room.phase !== "idle" && room.phase !== "lobby") {
      return;
    }

    const currentAttemptKey = session?.playerId ?? rememberedPlayer?.playerId ?? null;

    if (!currentAttemptKey || autoJoinAttempted.current === currentAttemptKey) {
      return;
    }

    const playerAlreadyInRoom =
      room.players.player1?.playerId === currentAttemptKey || room.players.player2?.playerId === currentAttemptKey;

    if (playerAlreadyInRoom) {
      autoJoinAttempted.current = currentAttemptKey;
      return;
    }

    const slotAvailable = !room.players.player1 || !room.players.player2;

    if (!slotAvailable) {
      return;
    }

    autoJoinAttempted.current = currentAttemptKey;

    startTransition(async () => {
      try {
        if (session) {
          await joinWithPlayer(session.playerId, {
            playerId: session.playerId,
            name: session.name,
            city: session.city,
            age: session.age,
            email: session.email,
          });
        } else if (rememberedPlayer) {
          setForm((current) => ({
            ...current,
            name: rememberedPlayer.name,
            country: "",
            region: rememberedPlayer.city,
            city: rememberedPlayer.city,
            age: String(rememberedPlayer.age),
            email: rememberedPlayer.email ?? "",
            acceptedTerms: true,
            newsletterOptIn: true,
          }));
          await joinWithPlayer(rememberedPlayer.playerId, rememberedPlayer);
        }
      } catch (autoJoinError) {
        setError(autoJoinError instanceof Error ? autoJoinError.message : "No fue posible reconectar.");
      }
    });
  }, [joinWithPlayer, rememberedPlayer, room, session]);

  const validation = useMemo(() => {
    const numericAge = Number(form.age);

    return registrationSchema.safeParse({
      roomCode: "PUBLICO",
      name: form.name,
      city: form.region,
      age: Number.isFinite(numericAge) ? numericAge : Number.NaN,
      email: form.email,
      acceptedTerms: form.acceptedTerms,
      newsletterOptIn: form.newsletterOptIn,
    });
  }, [form]);

  const currentMode: RoomMode | null = room?.mode ?? null;
  const countdown = room?.phase === "countdown" ? formatSeconds(room.countdown.endsAt, now, 0) : null;
  const readCountdown = room?.phase === "question-read" ? formatSeconds(room.currentQuestion.answersVisibleAt, now, 1) : null;
  const answerCountdown = room?.phase === "question" ? formatSeconds(room.currentQuestion.endsAt, now, 1) : null;
  const waitingCountdown = room?.lobby.waitingEndsAt ? formatSeconds(room.lobby.waitingEndsAt, now, 0) : null;
  const playerRank = playerSeat?.slot === 1 ? room?.leaderboard.player1Rank : room?.leaderboard.player2Rank;
  const playerFeedback =
    playerSeat?.slot === 1 ? room?.answerFeedback.player1 : playerSeat?.slot === 2 ? room?.answerFeedback.player2 : null;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateCountry(country: string) {
    setForm((current) => ({
      ...current,
      country,
      region: "",
      city: "",
    }));
  }

  function updateRegion(region: string) {
    setForm((current) => ({
      ...current,
      region,
      city: region,
    }));
  }

  function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Revisa los datos del formulario.");
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
          throw new Error(registrationPayload.message ?? "No se pudo guardar el registro.");
        }

        const player = registrationPayload.data.player as RememberedPlayer;
        autoJoinAttempted.current = player.playerId;
        await joinWithPlayer(player.playerId, {
          playerId: player.playerId,
          name: form.name,
          city: form.region,
          age: Number(form.age),
          email: form.email,
        });
      } catch (registrationError) {
        setError(registrationError instanceof Error ? registrationError.message : "No se pudo completar el registro.");
      }
    });
  }

  async function startMatch(mode: RoomMode) {
    if (!session) {
      return;
    }

    const response = await fetch("/api/public/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playerId: session.playerId,
        controllerToken: session.controllerToken,
        mode,
      }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      setError(payload.message ?? "No se pudo iniciar la partida.");
      return;
    }

    setRoom(payload.data.room as PublicRoomState);
    setError(null);
  }

  async function submitAnswer(choice: "A" | "B" | "C" | "D") {
    if (!session || !room?.currentQuestion.questionId) {
      return;
    }

    setSelectedChoiceState({
      questionIndex: room.currentQuestion.questionIndex,
      choice,
    });

    const response = await fetch("/api/public/answer", {
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
      setError(payload.message ?? "No se pudo registrar la respuesta.");
      setSelectedChoiceState(null);
      return;
    }

    setError(null);
  }

  if (!session && room && room.phase !== "idle" && room.phase !== "lobby") {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
            Partida en curso
          </p>
          <h1 className="font-display mt-4 text-4xl font-black uppercase tracking-[0.08em]">
            Espera tu turno
          </h1>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            Ya hay una sesión activa. Cuando termine, podrás entrar automáticamente a la siguiente partida.
          </p>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Vista previa</p>
          <p className="font-display mt-4 text-2xl font-black uppercase">
            {room.phase === "question-read" || room.phase === "question"
              ? room.currentQuestion.prompt
              : room.phase === "battle-result"
                ? "Duelo finalizado"
                : "Tabla de posiciones"}
          </p>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            {room.players.player1?.name ?? "P1"} vs {room.players.player2?.name ?? "P2"}
          </p>
        </div>

        {error ? (
          <div className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  if (!session) {
    return (
      <form className="enter-rise flex h-full flex-col gap-5" onSubmit={submitRegistration}>
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
            Únete a la batalla
          </p>
          <h1 className="font-display mt-4 text-4xl font-black uppercase tracking-[0.08em]">
            Juega desde tu celular
          </h1>
          <p className="mt-3 text-base leading-7 text-[color:var(--muted)]">
            Regístrate una vez y entra a competir. Si ya te conocemos, te volveremos a reconocer automáticamente.
          </p>
        </div>

        {rememberedPlayer ? (
          <button
            className="rounded-[1.45rem] border border-[color:var(--accent-cool)]/40 bg-[color:var(--panel-soft)] px-5 py-4 text-left transition hover:border-[color:var(--accent-cool)] hover:bg-white/7"
            onClick={() => {
              startTransition(async () => {
                try {
                  autoJoinAttempted.current = rememberedPlayer.playerId;
                  await joinWithPlayer(rememberedPlayer.playerId, rememberedPlayer);
                } catch (rememberedError) {
                  setError(rememberedError instanceof Error ? rememberedError.message : "No se pudo reconectar.");
                }
              });
            }}
            type="button"
          >
            <p className="font-display text-lg font-black uppercase text-[color:var(--accent-cool)]">
              Continuar como {rememberedPlayer.name}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {rememberedPlayer.city}
              {rememberedPlayer.email ? ` · ${rememberedPlayer.email}` : null}
            </p>
          </button>
        ) : null}

        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">Nombre</span>
          <input
            className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
            onChange={(event) => updateField("name", event.target.value)}
            value={form.name}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">País</span>
            <select
              className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
              onChange={(event) => updateCountry(event.target.value)}
              value={form.country}
            >
              <option value="">Selecciona un país</option>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">
              {form.country === "Puerto Rico" ? "Municipio" : "Estado o territorio"}
            </span>
            <select
              className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={regionOptions.length === 0}
              onChange={(event) => updateRegion(event.target.value)}
              value={form.region}
            >
              <option value="">
                {form.country ? "Selecciona una opción" : "Selecciona primero el país"}
              </option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">Edad</span>
            <button
              className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 text-left outline-none transition hover:bg-white/7 focus:border-[color:var(--accent)] focus:bg-white/7"
              onClick={() => setAgePickerOpen(true)}
              type="button"
            >
              {form.age ? `${form.age} años` : "Selecciona tu edad"}
            </button>
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
              Acepto los términos y condiciones del juego.
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
              Quiero recibir novedades por correo.
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
          {isPending ? "Entrando..." : "Siguiente"}
        </button>

        {agePickerOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/82 px-4">
            <div className="w-full max-w-sm rounded-[1.8rem] border border-white/10 bg-[color:var(--panel-strong)] p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Edad</p>
                  <h2 className="mt-3 text-xl font-black uppercase text-white">Selecciona tu edad</h2>
                </div>
                <button
                  className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]"
                  onClick={() => setAgePickerOpen(false)}
                  type="button"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-5 grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
                {AGE_OPTIONS.map((age) => (
                  <button
                    className={`rounded-[1rem] px-3 py-3 text-sm font-semibold transition ${
                      form.age === age
                        ? "bg-[color:var(--accent)] text-slate-950"
                        : "border border-white/10 bg-white/5 text-white hover:bg-white/8"
                    }`}
                    key={age}
                    onClick={() => {
                      updateField("age", age);
                      setAgePickerOpen(false);
                    }}
                    type="button"
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </form>
    );
  }

  if (!room || !playerSeat) {
    return (
      <section className="enter-rise flex h-full flex-col justify-center gap-5 text-center">
        <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Preparando</p>
        <h2 className="font-display text-3xl font-black uppercase">Conectando tu control</h2>
        {error ? <p className="text-sm text-red-200">{error}</p> : null}
      </section>
    );
  }

  if ((room.phase === "idle" || room.phase === "lobby") && !instructionsAck) {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Instrucciones</p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">Cómo jugar</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-[color:var(--muted)]">
            <li>Tienes 15 segundos para responder cada pregunta cuando aparezcan las opciones.</li>
            <li>Entre más rápido aciertes, más puntos sumas.</li>
            <li>Si fallas, verás feedback en rojo pero nunca revelaremos la respuesta correcta.</li>
            <li>
              En modo solo, si dejas sin responder 3 preguntas seguidas, la partida se reinicia y tu puntuación no entrará al
              leaderboard.
            </li>
          </ul>
        </div>
        <button
          className="font-display rounded-[1.45rem] bg-[linear-gradient(135deg,var(--accent),#ffd77a)] px-5 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105"
          onClick={() => {
            if (session?.playerId && typeof window !== "undefined") {
              window.sessionStorage.setItem(instructionsStorageKey(session.playerId), "1");
            }
            setInstructionsBump((value) => value + 1);
          }}
          type="button"
        >
          Continuar al lobby
        </button>
      </section>
    );
  }

  if (room.phase === "idle" || room.phase === "lobby") {
    const isPlayer1 = playerSeat.slot === 1;
    const canStartSolo = isPlayer1 && !room.players.player2;

    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
            Lobby
          </p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">
            {room.players.player2 ? "El duelo se está preparando" : isPlayer1 ? "Listo para comenzar" : "Esperando al jugador 1"}
          </h2>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            {room.players.player2
              ? "Jugador 2 ya entró. La cuenta regresiva del duelo arrancará automáticamente."
              : isPlayer1
                ? "Tienes 60 segundos para comenzar solo o esperar a que entre un segundo jugador."
                : "Si nadie más entra, el jugador 1 puede comenzar solo."}
          </p>
        </div>

        <div className="grid gap-4">
          <div className="glass-panel rounded-[1.8rem] p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Tu lugar</p>
            <p className="font-display mt-3 text-3xl font-black uppercase">
              P{playerSeat.slot} · {playerSeat.name}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">{playerSeat.city}</p>
            {waitingCountdown ? (
              <p className="mt-4 rounded-full border border-white/10 px-3 py-2 text-sm text-[color:var(--muted)]">
                Cuenta atrás del lobby: {waitingCountdown}s
              </p>
            ) : null}
          </div>

          {isPlayer1 ? (
            <div className="grid gap-3">
              <button
                className="font-display rounded-[1.45rem] bg-[linear-gradient(135deg,var(--accent),#ffd77a)] px-5 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-40"
                disabled={!canStartSolo || isPending}
                onClick={() => startMatch("solo")}
                type="button"
              >
                Comenzar
              </button>
            </div>
          ) : (
            <div className="rounded-[1.45rem] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-[color:var(--muted)]">
              El jugador 1 decide cuándo comienza la partida. Mantente en esta pantalla.
            </div>
          )}
        </div>

        {error ? (
          <div className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  if (room.phase === "countdown") {
    return (
      <section className="flex h-full items-center justify-center">
        <div className="enter-scale text-center">
          <p className="font-display text-sm uppercase tracking-[0.45em] text-[color:var(--accent)]">
            {room.mode === "battle" ? "Duelo por comenzar" : "El reto está por comenzar"}
          </p>
          <h2 className="font-display mt-5 text-8xl font-black uppercase">{countdown}</h2>
        </div>
      </section>
    );
  }

  if (room.phase === "question-read") {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-5">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
            Pregunta {room.currentQuestion.questionIndex}
          </p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.05em]">
            {room.currentQuestion.prompt}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
            Lee con calma. Las respuestas aparecerán en {readCountdown}s.
          </p>
        </div>

        <div className="rounded-[1.8rem] border border-white/10 bg-white/5 px-5 py-6 text-center">
          <p className="font-display text-5xl font-black uppercase text-[color:var(--accent-cool)]">{readCountdown}</p>
          <p className="mt-2 text-sm text-[color:var(--muted)]">Prepárate para responder.</p>
        </div>
      </section>
    );
  }

  if (room.phase === "question") {
    const alreadyAnswered = Boolean(room.answers[playerSeat.slot === 1 ? "player1" : "player2"]);

    return (
      <section className="enter-rise flex h-full flex-col gap-5">
        <div>
          <div className="flex items-center justify-between gap-4">
            <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
              Pregunta {room.currentQuestion.questionIndex}
            </p>
            <p className={`font-display text-3xl font-black ${Number(answerCountdown) <= 5 ? "timer-critical" : ""}`}>
              {answerCountdown}s
            </p>
          </div>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.06em]">
            {room.currentQuestion.prompt}
          </h2>
        </div>

        <div className="grid flex-1 gap-4">
          {room.currentQuestion.choices
            ? (Object.entries(room.currentQuestion.choices) as Array<["A" | "B" | "C" | "D", string]>).map(([choice, label]) => (
                <button
                  className="rounded-[1.8rem] border border-white/10 px-5 py-5 text-left transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed"
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
                  <p className="font-display text-5xl font-black uppercase">{choice}</p>
                  <p className="mt-3 text-base leading-6">{label}</p>
                </button>
              ))
            : null}
        </div>

        <p className="text-sm text-[color:var(--muted)]">
          {alreadyAnswered ? "Respuesta enviada." : "Toca una opción antes de que termine el tiempo."}
        </p>
      </section>
    );
  }

  if (room.phase === "answer-lock") {
    const glowClass =
      playerFeedback === "correct"
        ? "border-[color:var(--success)]/50 bg-[color:var(--success)]/12"
        : playerFeedback === "incorrect" || playerFeedback === "timeout"
          ? "border-[color:var(--danger)]/50 bg-[color:var(--danger)]/12"
          : "border-white/10 bg-white/5";

    return (
      <section className="enter-scale flex h-full flex-col justify-center gap-6 text-center">
        <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Respuestas cerradas</p>
        <div className={`rounded-[1.8rem] border px-5 py-8 ${glowClass}`}>
          <h2 className="font-display text-4xl font-black uppercase tracking-[0.08em]">
            {playerFeedback === "correct"
              ? "¡Correcta!"
              : playerFeedback === "incorrect"
                ? "Incorrecta"
                : playerFeedback === "timeout"
                  ? "Sin respuesta"
                  : "Procesando"}
          </h2>
        </div>
        {(playerSeat.slot === 1 ? room.warnings.player1AfkWarningVisible : room.warnings.player2AfkWarningVisible) ? (
          <p className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            Advertencia: llevas dos preguntas seguidas sin responder.
          </p>
        ) : null}
      </section>
    );
  }

  if (room.phase === "battle-result") {
    return (
      <section className="enter-scale flex h-full flex-col justify-center gap-6 text-center">
        <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">Resultado</p>
        <h2 className="font-display text-4xl font-black uppercase tracking-[0.08em]">
          {room.battleResult.winner === "player1"
            ? `${room.players.player1?.name ?? "Jugador 1"} gana`
            : room.battleResult.winner === "player2"
              ? `${room.players.player2?.name ?? "Jugador 2"} gana`
              : "Empate"}
        </h2>
      </section>
    );
  }

  if (room.phase === "leaderboard") {
    return (
      <section className="enter-rise flex h-full flex-col gap-5">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Leaderboard</p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">Clasificación</h2>
        </div>
        <LeaderboardList
          entries={room.leaderboard.visibleTop}
          highlightRanks={typeof playerRank === "number" ? [playerRank] : []}
        />
      </section>
    );
  }

  if (room.phase === "finished" || room.phase === "reset") {
    return (
      <section className="enter-scale flex h-full flex-col justify-center gap-6 text-center">
        <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Siguiente ronda</p>
        <h2 className="font-display text-4xl font-black uppercase tracking-[0.08em]">
          La arena se está reiniciando
        </h2>
        <p className="text-sm text-[color:var(--muted)]">
          {currentMode === "battle" ? "Pronto podrán entrar nuevos jugadores." : "La siguiente partida estará disponible en breve."}
        </p>
      </section>
    );
  }

  return null;
}
