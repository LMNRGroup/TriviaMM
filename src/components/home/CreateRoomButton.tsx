"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CreateRoomButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreateRoom() {
    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch("/api/rooms", {
          method: "POST",
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message ?? "Unable to create room.");
        }

        const room = payload.data as {
          roomCode: string;
          hostToken: string;
          hostSessionId: string;
        };

        localStorage.setItem(
          `trivia:host:${room.roomCode}`,
          JSON.stringify({
            hostToken: room.hostToken,
            hostSessionId: room.hostSessionId,
          }),
        );

        router.push(`/host/${room.roomCode}`);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Unable to create room.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <button
        className="font-display pulse-ring relative rounded-[1.5rem] bg-[linear-gradient(135deg,var(--accent),#ffd77a)] px-6 py-4 text-left text-lg font-black uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={handleCreateRoom}
        type="button"
      >
        {isPending ? "Creating room..." : "Create Host Room"}
      </button>
      {error ? <p className="text-sm text-red-200">{error}</p> : null}
    </div>
  );
}
