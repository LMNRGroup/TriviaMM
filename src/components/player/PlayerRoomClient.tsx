"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import {
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

function formatAverageSeconds(milliseconds: number | null | undefined) {
  if (typeof milliseconds !== "number") {
    return "--";
  }

  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function birthYearToAge(value: string) {
  const year = Number(value);

  if (!Number.isFinite(year)) {
    return Number.NaN;
  }

  return new Date().getFullYear() - year;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGameplayPhase(phase: PublicRoomState["phase"]) {
  return (
    phase === "countdown" ||
    phase === "question-read" ||
    phase === "question" ||
    phase === "answer-lock" ||
    phase === "battle-result"
  );
}

function isPlayerInRoom(room: PublicRoomState, playerId: string) {
  return room.players.player1?.playerId === playerId || room.players.player2?.playerId === playerId;
}

export function PlayerRoomClient() {
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [rememberedPlayer, setRememberedPlayer] = useState<RememberedPlayer | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [selectedChoiceState, setSelectedChoiceState] = useState<{ questionIndex: number; choice: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinInFlightPlayerId, setJoinInFlightPlayerId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const syncInFlightRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        setSessionHydrated(true);
        return;
      }

      try {
        setSession(normalizeStoredSession(JSON.parse(raw)));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      } finally {
        setSessionHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const birthYearOptions = useMemo(() => {
    const maxBirthYear = new Date().getFullYear() - 16;
    const years: number[] = [];

    for (let year = maxBirthYear; year >= 1900; year -= 1) {
      years.push(year);
    }

    return years;
  }, []);

  const regionOptions = useMemo(() => {
    if (form.country === "United States") {
      return US_STATE_AND_TERRITORY_OPTIONS;
    }

    if (form.country === "Puerto Rico") {
      return PUERTO_RICO_MUNICIPALITY_OPTIONS;
    }

    return [];
  }, [form.country]);

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

  const loadRoomState = useCallback(async () => {
    const response = await fetch("/api/public/state", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message ?? "No se pudo cargar la sala.");
    }

    const nextRoom = payload.data.room as PublicRoomState;
    const remoteRememberedPlayer = (payload.data.rememberedPlayer as RememberedPlayer | null) ?? null;

    setRoom((current) => {
      const sessionPlayerId = session?.playerId;

      if (
        current &&
        sessionPlayerId &&
        isGameplayPhase(current.phase) &&
        Boolean(current.currentMatchId) &&
        isPlayerInRoom(current, sessionPlayerId) &&
        (nextRoom.phase === "idle" || nextRoom.phase === "lobby") &&
        !nextRoom.currentMatchId &&
        !isPlayerInRoom(nextRoom, sessionPlayerId)
      ) {
        return current;
      }

      return nextRoom;
    });
    setRememberedPlayer((current) => remoteRememberedPlayer ?? current);
    setError(null);
    return nextRoom;
  }, [session?.playerId]);

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
    setJoinInFlightPlayerId(joinedPlayer.playerId);
    persistSession({
      playerId: joinedPlayer.playerId,
      name: joinedPlayer.name,
      city: joinedPlayer.city,
      age: Number(profile?.age ?? birthYearToAge(form.age) ?? 0),
      email: profile?.email ?? form.email,
      controllerToken: joinedPlayer.controllerToken,
      sessionId,
    });

    setRememberedPlayer(null);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const nextRoom = await loadRoomState();
      const joinedSeat =
        nextRoom.players.player1?.playerId === joinedPlayer.playerId ||
        nextRoom.players.player2?.playerId === joinedPlayer.playerId;

      if (joinedSeat) {
        break;
      }

      await wait(250);
    }

    setJoinInFlightPlayerId(null);
  }, [form.age, form.email, loadRoomState]);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;

      try {
        const nextRoom = await loadRoomState();
        const isSeatedPlayer =
          Boolean(session?.playerId) &&
          (nextRoom.players.player1?.playerId === session?.playerId ||
            nextRoom.players.player2?.playerId === session?.playerId);
        const tickDriverId = nextRoom.players.player1?.playerId ?? nextRoom.players.player2?.playerId ?? null;
        const isTickDriver = tickDriverId !== null && tickDriverId === session?.playerId;

        const shouldAdvanceMatch =
          isSeatedPlayer &&
          isTickDriver &&
          ((nextRoom.phase !== "idle" && nextRoom.phase !== "lobby") ||
            (nextRoom.phase === "lobby" && Boolean(nextRoom.lobby.waitingEndsAt) && !nextRoom.players.player2));

        if (!cancelled && shouldAdvanceMatch) {
          const tickResponse = await fetch("/api/public/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerId: session?.playerId,
              controllerToken: session?.controllerToken,
            }),
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
      } finally {
        syncInFlightRef.current = false;
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
  }, [loadRoomState, session?.controllerToken, session?.playerId]);

  useEffect(() => {
    if (!session || !playerSeat?.playerId) {
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
  }, [playerSeat?.playerId, session]);

  useEffect(() => {
    if (!room || !session) {
      return;
    }

    const playerStillInRoom =
      room.players.player1?.playerId === session.playerId || room.players.player2?.playerId === session.playerId;

    if (room.phase === "idle" && room.lobby.previewMessage === "lobby_timeout" && !playerStillInRoom) {
      const timeoutId = window.setTimeout(() => {
        persistSession(null);
        setRememberedPlayer(null);
        setError("Tu tiempo en la sala expiró. Entra de nuevo cuando estés listo.");
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [room, session]);

  const validation = useMemo(() => {
    const numericAge = birthYearToAge(form.age);

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
  const roomHasOpenSeat = !room?.players.player1 || !room?.players.player2;

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
        setRememberedPlayer({
          playerId: player.playerId,
          name: form.name,
          city: form.region,
          age: birthYearToAge(form.age),
          email: form.email,
        });
        setError(null);
      } catch (registrationError) {
        setError(registrationError instanceof Error ? registrationError.message : "No se pudo completar el registro.");
      }
    });
  }

  async function startMatch(mode: RoomMode) {
    if (!session || isStarting) {
      return;
    }

    setIsStarting(true);

    try {
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
    } finally {
      setIsStarting(false);
    }
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

  const pendingJoinPlayer: RememberedPlayer | null = !playerSeat
    ? session
      ? {
          playerId: session.playerId,
          name: session.name,
          city: session.city,
          age: session.age,
          email: session.email,
        }
      : rememberedPlayer
    : null;

  function joinLobby(profile: RememberedPlayer) {
    startTransition(async () => {
      try {
        await joinWithPlayer(profile.playerId, profile);
      } catch (joinError) {
        setJoinInFlightPlayerId(null);
        setError(joinError instanceof Error ? joinError.message : "No fue posible entrar a la sala.");
      }
    });
  }

  if (!sessionHydrated) {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Preparando</p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase">Cargando sesión</h2>
          <p className="connecting-dots mt-4 text-base text-[color:var(--muted)]">
            Espera mientras restauramos tu estado en este dispositivo.
          </p>
        </div>
      </section>
    );
  }

  if (joinInFlightPlayerId) {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Preparando</p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase">Entrando a la sala</h2>
          <p className="connecting-dots mt-4 text-base text-[color:var(--muted)]">
            Estamos reservando tu espacio antes de mostrar las preguntas.
          </p>
        </div>

        {error ? <p className="text-sm text-red-200">{error}</p> : null}
      </section>
    );
  }

  if (room && pendingJoinPlayer && room.phase !== "idle" && room.phase !== "lobby") {
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
            Ya hay una sesión activa. Cuando termine, podrás unirte a la sala si hay espacio disponible.
          </p>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Jugador listo</p>
          <p className="font-display mt-4 text-2xl font-black uppercase">
            {pendingJoinPlayer.name}
          </p>
          <p className="mt-3 text-sm text-[color:var(--muted)]">No reservaremos tu espacio hasta que toques unirte.</p>
        </div>

        {error ? (
          <div className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  if (room && pendingJoinPlayer && (room.phase === "idle" || room.phase === "lobby") && !roomHasOpenSeat) {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
            Sala ocupada
          </p>
          <h1 className="font-display mt-4 text-4xl font-black uppercase tracking-[0.08em]">
            Espera a la próxima partida
          </h1>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            Ya hay dos jugadores conectados en esta sesión. Cuando la sala vuelva a estar disponible, podrás intentar entrar.
          </p>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Estado actual</p>
          <p className="font-display mt-4 text-2xl font-black uppercase">
            {room.players.player1?.name ?? "Jugador 1"} vs {room.players.player2?.name ?? "Jugador 2"}
          </p>
          <p className="mt-3 text-sm text-[color:var(--muted)]">La sala admite un máximo de dos jugadores por sesión.</p>
        </div>

        {error ? (
          <div className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  if (room && pendingJoinPlayer && (room.phase === "idle" || room.phase === "lobby") && roomHasOpenSeat) {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">
            Listo para jugar
          </p>
          <h1 className="font-display mt-4 text-4xl font-black uppercase tracking-[0.08em]">
            Únete a la sala
          </h1>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            Toca el botón para reservar tu espacio. No entraremos automáticamente para darle oportunidad a todos.
          </p>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Jugador</p>
          <p className="font-display mt-4 text-2xl font-black uppercase">{pendingJoinPlayer.name}</p>
          <p className="mt-3 text-sm text-[color:var(--muted)]">{pendingJoinPlayer.city}</p>
        </div>

        {error ? (
          <div className="rounded-[1.35rem] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <button
          className="font-display mt-auto rounded-[1.45rem] bg-[linear-gradient(135deg,var(--accent),#ffd77a)] px-5 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isPending}
          onClick={() => joinLobby(pendingJoinPlayer)}
          type="button"
        >
          {isPending ? "Uniendo..." : "Unirme a la sala"}
        </button>
      </section>
    );
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
            Ya hay una sesión activa. Cuando termine, podrás registrarte o entrar si la sala tiene espacio.
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

  if (!session && room && (room.phase === "idle" || room.phase === "lobby") && !roomHasOpenSeat) {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
            Sala ocupada
          </p>
          <h1 className="font-display mt-4 text-4xl font-black uppercase tracking-[0.08em]">
            Espera a la próxima partida
          </h1>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            Ya hay dos jugadores conectados en esta sesión. Cuando la sala vuelva a estar disponible, podrás registrarte o entrar.
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
            Regístrate una vez y luego toca unirte para reservar tu espacio en la sala.
          </p>
        </div>

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
            <span className="text-sm font-semibold text-white">¿En qué año naciste?</span>
            <select
              className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
              onChange={(event) => updateField("age", event.target.value)}
              value={form.age}
            >
              <option value="">Selecciona tu año</option>
              {birthYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white">Email</span>
            <input
              className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
              autoCapitalize="none"
              autoComplete="email"
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="nombre@correo.com"
              type="email"
              value={form.email}
            />
          </label>
        </div>

        <label className="rounded-[1rem] border border-white/5 bg-white/[0.025] px-3 py-2 transition hover:bg-white/5">
          <div className="flex items-start gap-2.5">
            <input
              checked={form.acceptedTerms}
              className="mt-0.5 size-3.5 accent-[color:var(--accent)]"
              onChange={(event) => updateField("acceptedTerms", event.target.checked)}
              type="checkbox"
            />
            <span className="text-xs leading-5 text-[color:var(--muted)]/80">
              Acepto los términos y condiciones del juego.
            </span>
          </div>
        </label>

        <label className="rounded-[1rem] border border-white/5 bg-white/[0.025] px-3 py-2 transition hover:bg-white/5">
          <div className="flex items-start gap-2.5">
            <input
              checked={form.newsletterOptIn}
              className="mt-0.5 size-3.5 accent-[color:var(--accent)]"
              onChange={(event) => updateField("newsletterOptIn", event.target.checked)}
              type="checkbox"
            />
            <span className="text-xs leading-5 text-[color:var(--muted)]/80">
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
          {isPending ? "Registrando..." : "Registrarme"}
        </button>
      </form>
    );
  }

  if (!room || !playerSeat) {
    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Preparando</p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase">Conectando tu control</h2>
          <p className="connecting-dots mt-4 text-base text-[color:var(--muted)]">Espera mientras enlazamos tu celular con la pantalla</p>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-5">
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Cómo jugar</p>
          <ul className="mt-5 space-y-3 text-base leading-7 text-[color:var(--muted)]">
            <li>Tienes 15 segundos para responder cada pregunta cuando aparezcan las opciones.</li>
            <li>Entre más rápido aciertes, más puntos sumas.</li>
            <li>Si la sala está libre, te dejaremos continuar sin registrarte otra vez en este dispositivo.</li>
            <li>La sala pública admite un máximo de dos jugadores conectados a la vez.</li>
          </ul>
        </div>

        {error ? <p className="text-sm text-red-200">{error}</p> : null}
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
            Sala
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
                Cuenta atrás de la sala: {waitingCountdown}s
              </p>
            ) : null}
          </div>

          <div className="glass-panel rounded-[1.8rem] p-5">
            <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Cómo jugar</p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-[color:var(--muted)]">
              <li>Primero verás cada pregunta durante unos segundos para leerla con calma.</li>
              <li>Después aparecen las respuestas y empieza el temporizador para contestar.</li>
              <li>Entre más rápido aciertes, más puntos sumas y mejor será tu promedio de velocidad.</li>
            </ul>
          </div>

          {isPlayer1 ? (
            <div className="grid gap-3">
              <button
                className="font-display rounded-[1.45rem] bg-[linear-gradient(135deg,var(--accent),#ffd77a)] px-5 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-40"
                disabled={!canStartSolo || isPending || isStarting}
                onClick={() => startMatch("solo")}
                type="button"
              >
                {isStarting ? "Comenzando..." : "Comenzar"}
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
          <h2 className="countdown-pop font-display mt-5 text-8xl font-black uppercase">{countdown}</h2>
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
          {room.currentQuestion.category ? (
            <p className="mt-4 font-display text-base uppercase tracking-[0.22em] text-[color:var(--accent-strong)]">
              {room.currentQuestion.category}
            </p>
          ) : null}
          <h2 className="font-display mt-4 text-2xl font-black uppercase tracking-[0.05em] sm:text-3xl">
            {room.currentQuestion.prompt}
          </h2>
        </div>

        <div className="grid flex-1 gap-4">
          {room.currentQuestion.choices
            ? (Object.entries(room.currentQuestion.choices) as Array<["A" | "B" | "C" | "D", string]>).map(([choice, label]) => (
                <button
                  className="rounded-[1.8rem] border border-white/10 px-5 py-6 text-left transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed"
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
                  <div className="flex items-center gap-4">
                    <p className="font-display min-w-[3.2rem] text-6xl font-black uppercase sm:text-7xl">{choice}</p>
                    <p className="text-lg font-semibold leading-7 sm:text-xl">{label}</p>
                  </div>
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
        <div className="rounded-[1.8rem] border border-white/10 bg-white/5 px-5 py-5">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Tu resultado</p>
          <p className="font-display mt-3 text-3xl font-black uppercase">{playerSeat?.name ?? "Jugador"}</p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Puntuación</p>
              <p className="font-display mt-2 text-5xl font-black text-[color:var(--accent)]">
                {playerSeat ? `${playerSeat.totalScore}/10` : "--"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Promedio</p>
              <p className="font-display mt-2 text-4xl font-black">
                {formatAverageSeconds(playerSeat?.matchAverageResponseMs)}
              </p>
            </div>
          </div>
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
