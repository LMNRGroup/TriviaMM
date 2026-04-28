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

interface BugFinderPanelProps {
  events: BugEvent[];
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

export function BugFinderPanel({ events, onClear }: BugFinderPanelProps) {
  const [open, setOpen] = useState(false);
  const errorCount = useMemo(() => events.filter((event) => event.level === "error").length, [events]);
  const warningCount = useMemo(() => events.filter((event) => event.level === "warning").length, [events]);

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,25rem)]">
      <button
        className="ml-auto flex items-center gap-2 rounded-full border border-white/20 bg-[color:var(--panel)]/95 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>Bug Finder</span>
        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-100">{errorCount}</span>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-100">{warningCount}</span>
      </button>

      {open ? (
        <div className="mt-3 max-h-[60vh] overflow-hidden rounded-[1rem] border border-white/15 bg-[color:var(--panel)]/96 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              Diagnóstico en vivo
            </p>
            <button
              className="rounded-md border border-white/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)] hover:text-white"
              onClick={onClear}
              type="button"
            >
              Limpiar
            </button>
          </div>

          <div className="space-y-2 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-[color:var(--muted)]">
                No hay eventos capturados todavía.
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
