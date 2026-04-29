"use client";

import { useEffect, useRef, useState } from "react";
import {
  BugFinderPanel,
  type BugEvent,
  type BugEventLevel,
  type BugEventSource,
  type BugFinderRuntimeStats,
} from "@/components/debug/BugFinderPanel";
import type { PublicRoomState } from "@/lib/types/game";

const STORAGE_KEY = "trivia:player:public";

function isGameplayPhase(phase: PublicRoomState["phase"]) {
  return (
    phase === "countdown" ||
    phase === "question-read" ||
    phase === "question" ||
    phase === "answer-lock" ||
    phase === "battle-result"
  );
}

function shortError(value: unknown) {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}

function toEnglishDiagnostic(value: unknown) {
  const message = typeof value === "string" ? value : shortError(value);

  if (message === "No se pudo cargar la sala publica.") {
    return "Failed to load the public room.";
  }

  if (message === "No se encontro la sala publica.") {
    return "Public room not found.";
  }

  if (message === "El estado de la sala no esta disponible temporalmente en este nodo. Intenta de nuevo.") {
    return "Room state is temporarily unavailable on this runtime node. Retry shortly.";
  }

  if (message === "El estado de la sala publica no esta disponible temporalmente en este nodo.") {
    return "Public room state is temporarily unavailable on this runtime node.";
  }

  if (message === "La sala publica no esta disponible temporalmente en este nodo. Intenta de nuevo.") {
    return "The public room is temporarily unavailable on this runtime node. Retry shortly.";
  }

  return message;
}

export function BugFinderOverlay() {
  const [events, setEvents] = useState<BugEvent[]>([]);
  const [runtimeStats, setRuntimeStats] = useState<BugFinderRuntimeStats>({});
  const [recovering, setRecovering] = useState(false);
  const previousRoomRef = useRef<Pick<PublicRoomState, "phase" | "currentMatchId" | "version"> | null>(null);
  const kvWarningShownRef = useRef(false);
  const gameplayWarningShownRef = useRef(false);
  const stuckPhaseFingerprintRef = useRef<string | null>(null);

  function pushEvent(level: BugEventLevel, source: BugEventSource, message: string, details?: string) {
    const entry: BugEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      level,
      source,
      message,
      details,
    };

    setEvents((current) => [entry, ...current].slice(0, 35));
  }

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      pushEvent(
        "error",
        "runtime",
        event.message || "Runtime error",
        `${event.filename}:${event.lineno}:${event.colno}`,
      );
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      pushEvent("error", "runtime", "Unhandled promise rejection", shortError(event.reason));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const onClientDebug = (event: Event) => {
      const custom = event as CustomEvent<Record<string, unknown>>;
      const detail = custom.detail ?? {};

      setRuntimeStats((current) => ({
        ...current,
        roomVersion:
          typeof detail.roomVersion === "number"
            ? detail.roomVersion
            : current.roomVersion,
        lastAcceptedRoomVersion:
          typeof detail.lastAcceptedRoomVersion === "number"
            ? detail.lastAcceptedRoomVersion
            : current.lastAcceptedRoomVersion,
        ignoredStaleStateCount:
          typeof detail.ignoredStaleStateCount === "number"
            ? detail.ignoredStaleStateCount
            : current.ignoredStaleStateCount,
        tickDriver:
          typeof detail.tickDriver === "string" || detail.tickDriver === null
            ? (detail.tickDriver as string | null)
            : current.tickDriver,
      }));

      if (detail.event === "stale_state_ignored") {
        pushEvent(
          "warning",
          "state",
          "Stale state ignored",
          `v${String(detail.previousVersion ?? "--")} ${String(detail.previousPhase ?? "--")} -> v${String(detail.incomingVersion ?? "--")} ${String(detail.incomingPhase ?? "--")} (${String(detail.reason ?? "unknown")})`,
        );
      }
    };

    window.addEventListener("trivia:client-debug", onClientDebug as EventListener);
    return () => {
      window.removeEventListener("trivia:client-debug", onClientDebug as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkBackendHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          pushEvent("warning", "backend", "Health endpoint failed", toEnglishDiagnostic(payload?.message ?? response.statusText));
          return;
        }

        const runtimeMode = payload?.data?.ready?.kvRuntimeMode as string | undefined;
        const kvConfigured = Boolean(payload?.data?.ready?.kv);
        const kvConsistent = Boolean(payload?.data?.ready?.kvConsistent);
        const gameplaySafe = Boolean(payload?.data?.ready?.gameplaySafe);
        const battleModeEnabled = Boolean(payload?.data?.ready?.battleModeEnabled);
        const gameplayUnsafeReason =
          (payload?.data?.ready?.gameplayUnsafeReason as string | null | undefined) ?? null;

        setRuntimeStats((current) => ({
          ...current,
          kvRuntimeMode: runtimeMode ?? current.kvRuntimeMode,
          kvConsistent,
          gameplaySafe,
          battleModeEnabled,
        }));

        if (!kvConfigured) {
          if (!kvWarningShownRef.current) {
            pushEvent("warning", "backend", "KV not configured", "App is using local memory; multi-instance room state can drift.");
            kvWarningShownRef.current = true;
          }
          return;
        }

        if (runtimeMode !== "remote" && !kvWarningShownRef.current) {
          pushEvent(
            "warning",
            "backend",
            "KV not running in remote mode",
            `kvRuntimeMode=${runtimeMode ?? "unknown"}. This can cause erratic phase changes.`,
          );
          kvWarningShownRef.current = true;
        }

        if (!gameplaySafe && gameplayUnsafeReason && !gameplayWarningShownRef.current) {
          pushEvent("error", "backend", "Gameplay safety check failed", gameplayUnsafeReason);
          gameplayWarningShownRef.current = true;
        }
      } catch (error) {
        if (!cancelled) {
          pushEvent("warning", "backend", "Failed to check backend health", toEnglishDiagnostic(error));
        }
      }
    }

    void checkBackendHealth();
    const intervalId = window.setInterval(() => void checkBackendHealth(), 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollRoomState() {
      try {
        let sessionPlayerId = "";

        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as { playerId?: unknown };
            if (typeof parsed.playerId === "string") {
              sessionPlayerId = parsed.playerId;
            }
          }
        } catch {
          // Best-effort diagnostics only.
        }

        const previous = previousRoomRef.current;
        const response = await fetch("/api/public/state", {
          cache: "no-store",
          headers:
            sessionPlayerId || previous?.currentMatchId
              ? {
                  ...(sessionPlayerId ? { "x-trivia-player-id": sessionPlayerId } : {}),
                  ...(previous?.currentMatchId ? { "x-trivia-current-match-id": previous.currentMatchId } : {}),
                }
              : undefined,
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          if (payload?.error === "room_unavailable") {
            return;
          }
          pushEvent("warning", "network", "Room state request failed", toEnglishDiagnostic(payload?.message ?? response.statusText));
          return;
        }

        const room = payload?.data?.room as PublicRoomState | undefined;
        if (!room) {
          return;
        }

        setRuntimeStats((current) => ({
          ...current,
          roomVersion: room.version,
        }));

        if (previous && room.version < previous.version) {
          pushEvent(
            "warning",
            "state",
            "Received lower room version",
            `Incoming v${room.version} is older than previous v${previous.version}.`,
          );
        }

        if (
          previous &&
          previous.version !== room.version &&
          isGameplayPhase(previous.phase) &&
          (room.phase === "idle" || room.phase === "lobby") &&
          previous.currentMatchId &&
          !room.currentMatchId
        ) {
          pushEvent(
            "error",
            "state",
            "Unexpected phase regression",
            `From ${previous.phase} (match ${previous.currentMatchId}) to ${room.phase}.`,
          );
        }

        if (room.phase !== "idle" && room.phase !== "lobby") {
          const elapsedMs = Math.max(0, Date.now() - room.phaseStartedAt);
          const phaseLimitMs = room.phase === "finished" || room.phase === "reset" ? 20_000 : 90_000;

          if (elapsedMs >= phaseLimitMs) {
            const fingerprint = `${room.currentMatchId ?? "no_match"}:${room.phase}:${room.version}`;
            if (stuckPhaseFingerprintRef.current !== fingerprint) {
              stuckPhaseFingerprintRef.current = fingerprint;
              pushEvent(
                "warning",
                "state",
                "Phase running longer than expected",
                `${room.phase} has been active for ${Math.round(elapsedMs / 1000)}s (v${room.version}).`,
              );
            }
          }
        } else {
          stuckPhaseFingerprintRef.current = null;
        }

        previousRoomRef.current = {
          phase: room.phase,
          currentMatchId: room.currentMatchId,
          version: room.version,
        };
      } catch (error) {
        if (!cancelled) {
          pushEvent("warning", "network", "Error while polling /api/public/state", toEnglishDiagnostic(error));
        }
      }
    }

    void pollRoomState();
    const intervalId = window.setInterval(() => void pollRoomState(), 1_400);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  async function recoverRoom(force: boolean) {
    if (recovering) {
      return;
    }

    setRecovering(true);

    try {
      const response = await fetch("/api/public/recover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        pushEvent("error", "backend", force ? "Force reset failed" : "Recovery failed", toEnglishDiagnostic(payload?.message ?? response.statusText));
        return;
      }

      const room = payload?.data?.room as PublicRoomState | undefined;
      if (room) {
        previousRoomRef.current = {
          phase: room.phase,
          currentMatchId: room.currentMatchId,
          version: room.version,
        };
        setRuntimeStats((current) => ({
          ...current,
          roomVersion: room.version,
        }));
      }

      pushEvent(
        "info",
        "backend",
        force ? "Force reset applied" : "Recovery executed",
        `Room is now in ${room?.phase ?? "unknown"} phase (v${room?.version ?? "--"}).`,
      );
    } catch (error) {
      pushEvent("error", "backend", force ? "Force reset request failed" : "Recovery request failed", toEnglishDiagnostic(error));
    } finally {
      setRecovering(false);
    }
  }

  return (
    <BugFinderPanel
      events={events}
      runtimeStats={runtimeStats}
      recovering={recovering}
      onClear={() => setEvents([])}
      onRecover={recoverRoom}
    />
  );
}
