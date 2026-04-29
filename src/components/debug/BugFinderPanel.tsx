"use client";

import { useMemo, useState } from "react";

export type BugEventLevel = "error" | "warning" | "info";
export type BugEventSource = "runtime" | "network" | "state" | "backend";

export interface BugEvent {
  id: string;
  at: number;
  level: BugEventLevel;
  source: BugEventSource;
  message: string;
  details?: string;
}

export interface BugFinderRuntimeStats {
  kvRuntimeMode?: string;
  kvConsistent?: boolean;
  gameplaySafe?: boolean;
  roomVersion?: number;
  lastAcceptedRoomVersion?: number;
  ignoredStaleStateCount?: number;
  tickDriver?: string | null;
  battleModeEnabled?: boolean;
}

interface BugFinderPanelProps {
  events: BugEvent[];
  runtimeStats: BugFinderRuntimeStats;
  onClear: () => void;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString();
}

function levelStyles(level: BugEventLevel) {
  if (level === "error") {
    return "border-red-300/40 bg-red-500/10 text-red-100";
  }

  if (level === "warning") {
    return "border-amber-300/40 bg-amber-500/10 text-amber-100";
  }

  return "border-sky-300/40 bg-sky-500/10 text-sky-100";
}

function toLabelValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null) {
    return "none";
  }

  if (value === undefined) {
    return "--";
  }

  return String(value);
}

export function BugFinderPanel({ events, runtimeStats, onClear }: BugFinderPanelProps) {
  const [open, setOpen] = useState(false);
  const issueCount = useMemo(
    () => events.filter((event) => event.level === "error" || event.level === "warning").length,
    [events],
  );
  const hasIssues = issueCount > 0;
  const showPanel = hasIssues && open;

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,25rem)]">
      <button
        aria-label={hasIssues ? "Open diagnostics" : "No active diagnostics"}
        className={`ml-auto flex h-11 w-11 items-center justify-center rounded-full border bg-[color:var(--panel)]/95 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur transition ${
          hasIssues
            ? "cursor-pointer border-red-300/60 text-red-300 hover:scale-105 hover:text-red-200"
            : "cursor-default border-white/30 text-white/95"
        }`}
        disabled={!hasIssues}
        onClick={() => {
          if (!hasIssues) {
            return;
          }
          setOpen((value) => !value);
        }}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.9"
          viewBox="0 0 24 24"
        >
          <path d="M8.2 7.2 6 5M15.8 7.2 18 5M12 7V3M8.5 12h-5M20.5 12h-5M8.7 16.7 6.5 19M15.3 16.7l2.2 2.3" />
          <path d="M7 12.6c0-3.2 2.3-5.6 5-5.6s5 2.4 5 5.6c0 3.9-2.6 7.4-5 7.4s-5-3.5-5-7.4Z" />
        </svg>
      </button>

      {showPanel ? (
        <div className="mt-3 max-h-[60vh] overflow-hidden rounded-[1rem] border border-white/15 bg-[color:var(--panel)]/96 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              Live Diagnostics
            </p>
            <button
              className="rounded-md border border-white/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)] hover:text-white"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              type="button"
            >
              Clear
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted)]">
            <p>kvRuntimeMode: {toLabelValue(runtimeStats.kvRuntimeMode)}</p>
            <p>kvConsistent: {toLabelValue(runtimeStats.kvConsistent)}</p>
            <p>gameplaySafe: {toLabelValue(runtimeStats.gameplaySafe)}</p>
            <p>battleModeEnabled: {toLabelValue(runtimeStats.battleModeEnabled)}</p>
            <p>roomVersion: {toLabelValue(runtimeStats.roomVersion)}</p>
            <p>lastAcceptedRoomVersion: {toLabelValue(runtimeStats.lastAcceptedRoomVersion)}</p>
            <p>ignoredStaleStateCount: {toLabelValue(runtimeStats.ignoredStaleStateCount)}</p>
            <p>tickDriver: {toLabelValue(runtimeStats.tickDriver)}</p>
          </div>

          <div className="space-y-2 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-[color:var(--muted)]">
                No events captured yet.
              </div>
            ) : (
              events.map((event) => (
                <article key={event.id} className={`rounded-lg border px-3 py-2 ${levelStyles(event.level)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em]">
                      {event.level} · {event.source}
                    </p>
                    <p className="text-[11px] opacity-80">{formatTime(event.at)}</p>
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-5">{event.message}</p>
                  {event.details ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 opacity-90">{event.details}</p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
