"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { UNIVERSITY_OPTIONS } from "@/lib/data/universities";
import { decideRoomAcceptance } from "@/lib/game/public-room-guard";
import type { PublicRoomState, RoomMode } from "@/lib/types/game";
import { registrationSchema } from "@/lib/validation/registration";

interface JoinApiPlayer {
  playerId: string;
  name: string;
  city: string;
  university?: string;
  slot: 1 | 2;
  roomCode: string;
  controllerToken: string;
  sessionId: string;
}

interface PlayerSession {
  playerId: string;
  name: string;
  city: string;
  university?: string;
  age: number;
  email: string;
  controllerToken: string;
  sessionId: string;
}

interface RememberedPlayer {
  playerId: string;
  name: string;
  city: string;
  university?: string;
  age: number;
  /** Same-device hint from server; never part of `PublicRoomState`. */
  email?: string;
}

interface FormState {
  name: string;
  university: string;
  age: string;
  email: string;
  acceptedTerms: boolean;
  newsletterOptIn: boolean;
}

interface AnswerFeedbackSnapshot {
  questionIndex: number;
  status: "submitting" | "confirmed";
  feedback: "correct" | "incorrect" | "timeout" | null;
  responseTimeMs: number | null;
  awardedPoints: number | null;
}

const STORAGE_KEY = "trivia:player:public";
const TUTORIAL_STORAGE_PREFIX = "trivia:tutorial:done:";
const BATTLE_MODE_ENABLED =
  (process.env.NEXT_PUBLIC_ENABLE_BATTLE_MODE ?? "").trim().toLowerCase() === "1" ||
  (process.env.NEXT_PUBLIC_ENABLE_BATTLE_MODE ?? "").trim().toLowerCase() === "true" ||
  (process.env.NEXT_PUBLIC_ENABLE_BATTLE_MODE ?? "").trim().toLowerCase() === "yes";

type ClientApiError = Error & {
  code?: string;
  status?: number;
};

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
    university: typeof data.university === "string" ? data.university : undefined,
    age: typeof data.age === "number" ? data.age : Number(data.age ?? 0),
    email: typeof data.email === "string" ? data.email : "",
    controllerToken: data.controllerToken,
    sessionId: data.sessionId,
  };
}

const initialFormState: FormState = {
  name: "",
  university: "",
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

function formatResponseSeconds(milliseconds: number | null | undefined) {
  if (typeof milliseconds !== "number") {
    return "--";
  }

  return `${(milliseconds / 1000).toFixed(2)}s`;
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

function buildApiError(payload: unknown, status: number, fallbackMessage: string): ClientApiError {
  const message =
    payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : fallbackMessage;
  const error = new Error(message) as ClientApiError;
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    error.code = payload.error;
  }
  error.status = status;
  return error;
}

function getApiErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  return typeof (error as ClientApiError).code === "string" ? (error as ClientApiError).code ?? null : null;
}

function isTransientRoomRoutingErrorCode(code: string | null) {
  return code === "room_unavailable" || code === "room_not_found";
}

function emitPlayerDebug(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent("trivia:client-debug", {
      detail: {
        role: "player",
        ...detail,
      },
    }),
  );
}

function getTutorialStorageKey(playerId: string) {
  return `${TUTORIAL_STORAGE_PREFIX}${playerId}`;
}

export function PlayerRoomClient() {
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [rememberedPlayer, setRememberedPlayer] = useState<RememberedPlayer | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [selectedChoiceState, setSelectedChoiceState] = useState<{ questionIndex: number; choice: string } | null>(null);
  const [answerFeedbackSnapshot, setAnswerFeedbackSnapshot] = useState<AnswerFeedbackSnapshot | null>(null);
  const [tutorialProgressByPlayer, setTutorialProgressByPlayer] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [joinInFlightPlayerId, setJoinInFlightPlayerId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const syncInFlightRef = useRef(false);
  const lastGameplayFingerprintRef = useRef<string | null>(null);
  const lastAcceptedRoomVersionRef = useRef<number>(0);
  const lastAcceptedPhaseRef = useRef<PublicRoomState["phase"] | null>(null);
  const currentMatchIdRef = useRef<string | null>(null);
  const ignoredStaleStateCountRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  const emitAcceptanceDebug = useCallback((roomState: PublicRoomState, tickDriver: string | null) => {
    lastAcceptedRoomVersionRef.current = roomState.version;
    lastAcceptedPhaseRef.current = roomState.phase;
    currentMatchIdRef.current = roomState.currentMatchId;
    emitPlayerDebug({
      roomVersion: roomState.version,
      lastAcceptedRoomVersion: roomState.version,
      ignoredStaleStateCount: ignoredStaleStateCountRef.current,
      tickDriver,
      phase: roomState.phase,
      currentMatchId: roomState.currentMatchId,
    });
  }, []);

  const trackGameplayProgress = useCallback((nextRoom: PublicRoomState) => {
    if (!isGameplayPhase(nextRoom.phase) || !nextRoom.currentMatchId) {
      lastGameplayFingerprintRef.current = null;
      return;
    }

    const fingerprint = `${nextRoom.currentMatchId}:${nextRoom.version}`;
    if (lastGameplayFingerprintRef.current !== fingerprint) {
      lastGameplayFingerprintRef.current = fingerprint;
    }
  }, []);

  const acceptRoomCandidate = useCallback((candidate: PublicRoomState, source: string, tickDriver: string | null) => {
    let accepted = true;
    let acceptedRoom = candidate;
    let decisionDetails = "";
    let decisionReason = "";
    let previousVersion = lastAcceptedRoomVersionRef.current;
    let previousPhase: PublicRoomState["phase"] | null = lastAcceptedPhaseRef.current;

    setRoom((current) => {
      if (current) {
        previousVersion = current.version;
        previousPhase = current.phase;
      }

      const decision = decideRoomAcceptance(current, candidate);
      decisionDetails = decision.details;
      decisionReason = decision.reason;

      if (!decision.accept) {
        accepted = false;
        acceptedRoom = current ?? candidate;
        return current ?? candidate;
      }

      acceptedRoom = candidate;
      return candidate;
    });

    if (!accepted) {
      ignoredStaleStateCountRef.current += 1;
      emitPlayerDebug({
        level: "warning",
        event: "stale_state_ignored",
        source,
        reason: decisionReason,
        details: decisionDetails,
        previousVersion,
        incomingVersion: candidate.version,
        previousPhase,
        incomingPhase: candidate.phase,
        ignoredStaleStateCount: ignoredStaleStateCountRef.current,
      });
      return acceptedRoom;
    }

    emitAcceptanceDebug(acceptedRoom, tickDriver);
    trackGameplayProgress(acceptedRoom);
    return acceptedRoom;
  }, [emitAcceptanceDebug, trackGameplayProgress]);

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

  const playerSeat = room
    ? room.players.player1?.playerId === session?.playerId
      ? room.players.player1
      : room.players.player2?.playerId === session?.playerId
        ? room.players.player2
        : null
    : null;
  const tutorialStep = useMemo(() => {
    if (!playerSeat?.playerId) {
      return null;
    }

    const storedProgress = tutorialProgressByPlayer[playerSeat.playerId];
    if (typeof storedProgress === "number") {
      return storedProgress;
    }

    if (typeof window === "undefined") {
      return null;
    }

    const seen = window.localStorage.getItem(getTutorialStorageKey(playerSeat.playerId)) === "1";
    return seen ? -1 : 0;
  }, [playerSeat?.playerId, tutorialProgressByPlayer]);

  const selectedChoice =
    selectedChoiceState && selectedChoiceState.questionIndex === room?.currentQuestion.questionIndex
      ? selectedChoiceState.choice
      : null;
  const localAnswerForCurrentQuestion =
    answerFeedbackSnapshot && answerFeedbackSnapshot.questionIndex === room?.currentQuestion.questionIndex
      ? answerFeedbackSnapshot
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

  function switchPlayer() {
    persistSession(null);
    setRememberedPlayer(null);
    setJoinInFlightPlayerId(null);
    setSelectedChoiceState(null);
    setAnswerFeedbackSnapshot(null);
    setForm(initialFormState);
    setError(null);
  }

  function completeTutorial() {
    if (!playerSeat?.playerId) {
      return;
    }

    window.localStorage.setItem(getTutorialStorageKey(playerSeat.playerId), "1");
    setTutorialProgressByPlayer((current) => ({
      ...current,
      [playerSeat.playerId]: -1,
    }));
  }

  function playAgain() {
    if (session) {
      setRememberedPlayer({
        playerId: session.playerId,
        name: session.name,
        city: session.city,
        university: session.university,
        age: session.age,
        email: session.email,
      });
    }

    persistSession(null);
    setJoinInFlightPlayerId(null);
    setSelectedChoiceState(null);
    setAnswerFeedbackSnapshot(null);
    setError(null);
  }

  const loadRoomState = useCallback(async () => {
    const response = await fetch("/api/public/state", {
      cache: "no-store",
      headers:
        session?.playerId || currentMatchIdRef.current
          ? {
              ...(session?.playerId ? { "x-trivia-player-id": session.playerId } : {}),
              ...(currentMatchIdRef.current ? { "x-trivia-current-match-id": currentMatchIdRef.current } : {}),
            }
          : undefined,
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw buildApiError(payload, response.status, "No se pudo cargar la sala.");
    }

    const nextRoom = payload.data.room as PublicRoomState;

    const tickDriverId = nextRoom.players.player1?.playerId ?? nextRoom.players.player2?.playerId ?? null;
    const resolvedRoom = acceptRoomCandidate(nextRoom, "poll_state", tickDriverId);
    setError(null);
    return resolvedRoom;
  }, [acceptRoomCandidate, session]);

  const joinWithPlayer = useCallback(async (playerId: string, profile?: RememberedPlayer) => {
    const sessionId = crypto.randomUUID();
    let response: Response | null = null;
    let payload: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch("/api/public/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-trivia-allow-room-create": !session?.playerId && !currentMatchIdRef.current ? "1" : "0",
        },
        body: JSON.stringify({
          playerId,
          sessionId,
        }),
      });
      payload = await response.json();

      if (response.ok && payload && typeof payload === "object" && (payload as { ok?: boolean }).ok) {
        break;
      }

      const code =
        payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? ((payload as { error?: string }).error ?? null)
          : null;
      if (!isTransientRoomRoutingErrorCode(code) || attempt === 2) {
        break;
      }

      await wait(150);
    }

    if (!response || !payload || !response.ok || !(payload as { ok?: boolean }).ok) {
      throw buildApiError(payload, response?.status ?? 500, "No fue posible entrar a la sala.");
    }

    const joinedPayload = payload as {
      data: {
        player: JoinApiPlayer;
        room?: PublicRoomState;
      };
    };
    const joinedPlayer = joinedPayload.data.player as JoinApiPlayer;
    const joinedRoom = joinedPayload.data.room as PublicRoomState | undefined;
    setJoinInFlightPlayerId(joinedPlayer.playerId);
    persistSession({
      playerId: joinedPlayer.playerId,
      name: joinedPlayer.name,
      city: joinedPlayer.city,
      university: profile?.university ?? joinedPlayer.university,
      age: Number(profile?.age ?? birthYearToAge(form.age) ?? 0),
      email: profile?.email ?? form.email,
      controllerToken: joinedPlayer.controllerToken,
      sessionId,
    });

    setRememberedPlayer(null);

    if (joinedRoom) {
      const tickDriverId = joinedRoom.players.player1?.playerId ?? joinedRoom.players.player2?.playerId ?? null;
      acceptRoomCandidate(joinedRoom, "join_response", tickDriverId);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let nextRoom: PublicRoomState;

      try {
        nextRoom = await loadRoomState();
      } catch (error) {
        if (attempt === 2) {
          throw error;
        }
        await wait(250);
        continue;
      }

      const joinedSeat =
        nextRoom.players.player1?.playerId === joinedPlayer.playerId ||
        nextRoom.players.player2?.playerId === joinedPlayer.playerId;

      if (joinedSeat) {
        break;
      }

      await wait(250);
    }

    setJoinInFlightPlayerId(null);
  }, [acceptRoomCandidate, form.age, form.email, loadRoomState, session]);

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
        emitPlayerDebug({
          roomVersion: nextRoom.version,
          lastAcceptedRoomVersion: lastAcceptedRoomVersionRef.current,
          ignoredStaleStateCount: ignoredStaleStateCountRef.current,
          tickDriver: tickDriverId,
          phase: nextRoom.phase,
          currentMatchId: nextRoom.currentMatchId,
        });

        const shouldAdvanceMatch =
          isSeatedPlayer &&
          isTickDriver &&
          ((nextRoom.phase !== "idle" && nextRoom.phase !== "lobby") ||
            (nextRoom.phase === "lobby" && Boolean(nextRoom.lobby.waitingEndsAt) && !nextRoom.players.player2));

        if (!cancelled && shouldAdvanceMatch) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
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
              const tickRoom = tickPayload.data.room as PublicRoomState;
              const tickDriver = tickRoom.players.player1?.playerId ?? tickRoom.players.player2?.playerId ?? null;
              acceptRoomCandidate(tickRoom, "tick_response", tickDriver);
              break;
            }

            const tickErrorCode =
              tickPayload && typeof tickPayload === "object" && typeof tickPayload.error === "string"
                ? tickPayload.error
                : null;
            if (!isTransientRoomRoutingErrorCode(tickErrorCode) || attempt === 2) {
              break;
            }

            await wait(130);
          }
        }
      } catch (syncError) {
        if (!cancelled) {
          const errorCode = getApiErrorCode(syncError);
          const lastPhase = lastAcceptedPhaseRef.current;
          if (
            isTransientRoomRoutingErrorCode(errorCode) &&
            Boolean(currentMatchIdRef.current) &&
            lastPhase !== null &&
            isGameplayPhase(lastPhase)
          ) {
            return;
          }

          setError(syncError instanceof Error ? syncError.message : "No se pudo sincronizar la partida.");
        }
      } finally {
        syncInFlightRef.current = false;
      }
    }

    void sync();
    const poll = window.setInterval(() => {
      void sync();
    }, 450);
    const timer = window.setInterval(() => setNow(Date.now()), 100);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(timer);
    };
  }, [acceptRoomCandidate, loadRoomState, session?.controllerToken, session?.playerId]);

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
        setError("Tu tiempo de espera en la sala expiró. Toca unirte de nuevo para continuar.");
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [room, session]);

  const validation = useMemo(() => {
    const numericAge = birthYearToAge(form.age);

    return registrationSchema.safeParse({
      roomCode: "PUBLICO",
      name: form.name,
      university: form.university,
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
          name: player.name,
          city: player.city,
          university: player.university ?? form.university,
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

    if (mode === "battle" && !BATTLE_MODE_ENABLED) {
      setError("Battle mode esta temporalmente desactivado.");
      return;
    }

    setIsStarting(true);

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
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

        if (response.ok && payload.ok) {
          const nextRoom = payload.data.room as PublicRoomState;
          const tickDriverId = nextRoom.players.player1?.playerId ?? nextRoom.players.player2?.playerId ?? null;
          acceptRoomCandidate(nextRoom, "start_response", tickDriverId);
          setError(null);
          return;
        }

        const code = payload && typeof payload.error === "string" ? payload.error : null;
        if (isTransientRoomRoutingErrorCode(code) && attempt < 2) {
          await wait(150);
          continue;
        }

        setError(payload.message ?? "No se pudo iniciar la partida.");
        return;
      }
    } finally {
      setIsStarting(false);
    }
  }

  async function submitAnswer(choice: "A" | "B" | "C" | "D") {
    if (!session || !room?.currentQuestion.questionId) {
      return;
    }

    const questionIndex = room.currentQuestion.questionIndex;
    setSelectedChoiceState({
      questionIndex,
      choice,
    });
    setAnswerFeedbackSnapshot({
      questionIndex,
      status: "submitting",
      feedback: null,
      responseTimeMs: null,
      awardedPoints: null,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
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

      if (response.ok && payload.ok) {
        const submission = payload.data?.submission as
          | {
              feedback?: "correct" | "incorrect" | "timeout";
              responseTimeMs?: number | null;
              awardedPoints?: number;
            }
          | undefined;
        setAnswerFeedbackSnapshot({
          questionIndex,
          status: "confirmed",
          feedback: submission?.feedback ?? null,
          responseTimeMs: typeof submission?.responseTimeMs === "number" ? submission.responseTimeMs : null,
          awardedPoints: typeof submission?.awardedPoints === "number" ? submission.awardedPoints : null,
        });
        setError(null);
        return;
      }

      const code = payload && typeof payload === "object" && typeof payload.error === "string" ? payload.error : null;
      if (isTransientRoomRoutingErrorCode(code) && attempt < 2) {
        await wait(130);
        continue;
      }

      setError(payload.message ?? "No se pudo registrar la respuesta.");
      setSelectedChoiceState(null);
      setAnswerFeedbackSnapshot(null);
      return;
    }
  }

  const pendingJoinPlayer: RememberedPlayer | null = !playerSeat
    ? session
      ? {
          playerId: session.playerId,
          name: session.name,
          city: session.city,
          university: session.university,
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
          <button
            className="mt-5 rounded-[1.1rem] border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:bg-white/10 hover:text-white"
            onClick={switchPlayer}
            type="button"
          >
            Usar otro jugador
          </button>
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
          <button
            className="mt-5 rounded-[1.1rem] border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:bg-white/10 hover:text-white"
            onClick={switchPlayer}
            type="button"
          >
            Usar otro jugador
          </button>
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
          <p className="mt-3 text-sm text-[color:var(--muted)]">{pendingJoinPlayer.university ?? pendingJoinPlayer.city}</p>
          <button
            className="mt-5 rounded-[1.1rem] border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:bg-white/10 hover:text-white"
            onClick={switchPlayer}
            type="button"
          >
            Usar otro jugador
          </button>
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
          <span className="text-sm font-semibold text-white">Nombre y apellido</span>
          <input
            className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
            placeholder="Ej. Ana Rivera"
            onChange={(event) => updateField("name", event.target.value)}
            value={form.name}
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-white">Universidad que representas</span>
          <select
            className="w-full rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:bg-white/7"
            onChange={(event) => updateField("university", event.target.value)}
            value={form.university}
          >
            <option value="">Selecciona tu universidad</option>
            {UNIVERSITY_OPTIONS.map((university) => (
              <option key={university.acronym} value={university.name}>
                {university.name} ({university.acronym})
              </option>
            ))}
          </select>
        </label>

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
            <li>Tienes 10 segundos para responder cada pregunta cuando aparezcan las opciones.</li>
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
    const tutorialActive = isPlayer1 && tutorialStep !== null && tutorialStep >= 0;
    const tutorialProgress = Math.min(Math.max(tutorialStep ?? 0, 0), 2);
    const canStartSoloNow = canStartSolo && !tutorialActive;

    return (
      <section className="enter-rise flex h-full flex-col justify-between gap-6">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent-strong)]">
            Sala
          </p>
          <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">
            {room.players.player2
              ? "El duelo se está preparando"
              : isPlayer1
              ? "Listo para comenzar"
              : "Esperando al jugador 1"}
          </h2>
          <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
            {!BATTLE_MODE_ENABLED
              ? "El modo battle está temporalmente desactivado. Esta sala funciona en modo solo para asegurar estabilidad."
              : room.players.player2
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
            <p className="mt-1 text-sm text-[color:var(--muted)]">{playerSeat.university ?? playerSeat.city}</p>
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

          {tutorialActive ? (
            <div className="glass-panel rounded-[1.8rem] border border-[color:var(--accent)]/35 p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--accent)]">
                Tutorial rápido ({tutorialProgress + 1}/3)
              </p>

              {tutorialProgress === 0 ? (
                <div className="mt-4 space-y-3">
                  <h3 className="font-display text-2xl font-black uppercase">Cómo funciona</h3>
                  <p className="text-sm leading-6 text-[color:var(--muted)]">
                    Las preguntas salen en la pantalla grande. Tú respondes desde este celular. Primero verás la pregunta (5s) y luego tendrás 10s para contestar.
                  </p>
                </div>
              ) : null}

              {tutorialProgress === 1 ? (
                <div className="mt-4 space-y-3">
                  <h3 className="font-display text-2xl font-black uppercase">Práctica guiada</h3>
                  <p className="text-sm leading-6 text-[color:var(--muted)]">
                    Ejemplo: ¿Cuánto es 2 + 2? Toca la respuesta correcta.
                  </p>
                  <div className="grid gap-2">
                    {(["A) 2", "B) 4", "C) 5", "D) 8"] as const).map((option) => (
                      <div
                        className={`rounded-[1rem] border px-3 py-2 text-sm ${
                          option.startsWith("B")
                            ? "border-[color:var(--success)]/50 bg-[color:var(--success)]/12 text-green-100"
                            : "border-white/10 bg-white/5 text-[color:var(--muted)]"
                        }`}
                        key={option}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {tutorialProgress === 2 ? (
                <div className="mt-4 space-y-3">
                  <h3 className="font-display text-2xl font-black uppercase">Listo</h3>
                  <p className="text-sm leading-6 text-[color:var(--muted)]">
                    Ya sabes el flujo. Pulsa <strong>Listo</strong> y luego <strong>Comenzar</strong> para arrancar la trivia real.
                  </p>
                </div>
              ) : null}

              <div className="mt-5 flex gap-3">
                {tutorialProgress < 2 ? (
                  <button
                    className="rounded-[1rem] border border-white/15 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
                    onClick={() => {
                      if (!playerSeat?.playerId) {
                        return;
                      }

                      setTutorialProgressByPlayer((current) => ({
                        ...current,
                        [playerSeat.playerId]: Math.min((current[playerSeat.playerId] ?? 0) + 1, 2),
                      }));
                    }}
                    type="button"
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    className="rounded-[1rem] border border-[color:var(--success)]/45 bg-[color:var(--success)]/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-green-100 transition hover:bg-[color:var(--success)]/25"
                    onClick={completeTutorial}
                    type="button"
                  >
                    Listo
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {isPlayer1 ? (
            <div className="grid gap-3">
              <button
                className="font-display rounded-[1.45rem] bg-[linear-gradient(135deg,var(--accent),#ffd77a)] px-5 py-4 text-base font-black uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-40"
                disabled={!canStartSoloNow || isPending || isStarting}
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
    const alreadyAnswered =
      Boolean(room.answers[playerSeat.slot === 1 ? "player1" : "player2"]) || Boolean(localAnswerForCurrentQuestion);

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
          {!alreadyAnswered
            ? "Toca una opción antes de que termine el tiempo."
            : localAnswerForCurrentQuestion?.status === "submitting"
              ? "Respuesta enviada. Validando..."
              : localAnswerForCurrentQuestion?.feedback === "correct"
                ? `¡Correcta! +${localAnswerForCurrentQuestion.awardedPoints ?? 0} pts • ${formatResponseSeconds(localAnswerForCurrentQuestion.responseTimeMs)}`
                : localAnswerForCurrentQuestion?.feedback === "incorrect"
                  ? `Incorrecta • +${localAnswerForCurrentQuestion.awardedPoints ?? 0} pts • ${formatResponseSeconds(localAnswerForCurrentQuestion.responseTimeMs)}`
                  : "Respuesta enviada."}
        </p>
      </section>
    );
  }

  if (room.phase === "answer-lock") {
    const resolvedFeedback =
      playerFeedback ??
      (localAnswerForCurrentQuestion?.status === "confirmed" ? localAnswerForCurrentQuestion.feedback : null);
    const glowClass =
      resolvedFeedback === "correct"
        ? "border-[color:var(--success)]/50 bg-[color:var(--success)]/12"
        : resolvedFeedback === "incorrect" || resolvedFeedback === "timeout"
          ? "border-[color:var(--danger)]/50 bg-[color:var(--danger)]/12"
          : "border-white/10 bg-white/5";

    return (
      <section className="enter-scale flex h-full flex-col justify-center gap-6 text-center">
        <p className="font-display text-sm uppercase tracking-[0.42em] text-[color:var(--accent)]">Respuesta bloqueada</p>
        <div className={`rounded-[1.8rem] border px-5 py-8 ${glowClass}`}>
          <h2 className="font-display text-4xl font-black uppercase tracking-[0.08em]">
            {resolvedFeedback === "correct"
              ? "¡Correcta!"
              : resolvedFeedback === "incorrect"
                ? "Incorrecta"
                : resolvedFeedback === "timeout"
                  ? "Sin respuesta"
                  : "Preparando siguiente pregunta"}
          </h2>
          {localAnswerForCurrentQuestion?.status === "confirmed" ? (
            <p className="mt-4 text-sm text-[color:var(--muted)]">
              Tiempo: {formatResponseSeconds(localAnswerForCurrentQuestion.responseTimeMs)} · Puntos: +{localAnswerForCurrentQuestion.awardedPoints ?? 0}
            </p>
          ) : null}
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
          {room.mode === "solo"
            ? `${room.players.player1?.name ?? "Jugador"} termina la ronda`
            : room.battleResult.winner === "player1"
              ? `${room.players.player1?.name ?? "Jugador 1"} gana`
              : room.battleResult.winner === "player2"
                ? `${room.players.player2?.name ?? "Jugador 2"} gana`
                : "Empate"}
        </h2>
        <p className="text-sm text-[color:var(--muted)]">
          Puntos: {playerSeat.totalScore}/10 · Promedio: {formatAverageSeconds(playerSeat.matchAverageResponseMs)}
        </p>
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
        <button
          className="font-display mt-auto rounded-[1.3rem] border border-white/15 bg-white/7 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/12"
          onClick={playAgain}
          type="button"
        >
          Jugar otra vez
        </button>
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
