"use client";

import { useEffect, useRef, useState } from "react";
import { BugFinderPanel, type BugEvent, type BugEventLevel, type BugEventSource } from "@/components/debug/BugFinderPanel";
import type { PublicRoomState } from "@/lib/types/game";

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

export function BugFinderOverlay() {
  const [events, setEvents] = useState<BugEvent[]>([]);
  const previousRoomRef = useRef<Pick<PublicRoomState, "phase" | "currentMatchId" | "updatedAt"> | null>(null);
  const kvWarningShownRef = useRef(false);

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
    let cancelled = false;

    async function checkBackendHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          pushEvent("warning", "backend", "Health endpoint failed", payload?.message ?? response.statusText);
          return;
        }

        const runtimeMode = payload?.data?.ready?.kvRuntimeMode as string | undefined;
        const kvConfigured = Boolean(payload?.data?.ready?.kv);

        if (!kvConfigured) {
          if (!kvWarningShownRef.current) {
            pushEvent("warning", "backend", "KV no configurado", "La app usa memoria local; multi-instancia puede desincronizar partidas.");
            kvWarningShownRef.current = true;
          }
          return;
        }

        if (runtimeMode !== "remote" && !kvWarningShownRef.current) {
          pushEvent(
            "warning",
            "backend",
            "KV en modo no remoto",
            `kvRuntimeMode=${runtimeMode ?? "unknown"}. Esto puede causar cambios erráticos de fase.`,
          );
          kvWarningShownRef.current = true;
        }
      } catch (error) {
        if (!cancelled) {
          pushEvent("warning", "backend", "No se pudo verificar salud del backend", shortError(error));
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
        const response = await fetch("/api/public/state", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          pushEvent("warning", "network", "Fallo consultando estado de sala", payload?.message ?? response.statusText);
          return;
        }

        const room = payload?.data?.room as PublicRoomState | undefined;
        if (!room) {
          return;
        }

        const previous = previousRoomRef.current;

        if (
          previous &&
          previous.updatedAt !== room.updatedAt &&
          isGameplayPhase(previous.phase) &&
          (room.phase === "idle" || room.phase === "lobby") &&
          previous.currentMatchId &&
          !room.currentMatchId
        ) {
          pushEvent(
            "error",
            "state",
            "Regresión inesperada de fase",
            `De ${previous.phase} (match ${previous.currentMatchId}) a ${room.phase}.`,
          );
        }

        previousRoomRef.current = {
          phase: room.phase,
          currentMatchId: room.currentMatchId,
          updatedAt: room.updatedAt,
        };
      } catch (error) {
        if (!cancelled) {
          pushEvent("warning", "network", "Error consultando /api/public/state", shortError(error));
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

  return <BugFinderPanel events={events} onClear={() => setEvents([])} />;
}
