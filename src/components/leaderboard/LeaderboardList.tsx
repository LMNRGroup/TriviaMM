import type { PublicLeaderboardEntry } from "@/lib/types/game";

function rankHighlightClass(rank: number) {
  if (rank <= 1) {
    return "border-[color:var(--accent)]/55 bg-[linear-gradient(135deg,rgba(255,214,128,0.14),rgba(61,224,163,0.08))] shadow-[0_0_24px_rgba(255,214,128,0.12)]";
  }
  if (rank === 2) {
    return "border-[color:var(--accent-cool)]/45 bg-white/10";
  }
  if (rank === 3) {
    return "border-white/20 bg-white/8";
  }
  return "border-white/10 bg-white/6";
}

function CrownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 18h16l-1.5-9-4.3 3.3L12 6l-2.2 6.3L5.5 9 4 18Z"
        fill="currentColor"
      />
      <path
        d="M4 18h16M7 21h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function LeaderboardList({
  entries,
  highlightRanks = [],
  topLimit,
  showExtraRanks = true,
  variant = "compact",
}: {
  entries: PublicLeaderboardEntry[];
  /** Any rank value (e.g. current players) to emphasize if missing from `entries`. */
  highlightRanks?: number[];
  topLimit?: number;
  showExtraRanks?: boolean;
  variant?: "compact" | "dramatic" | "broadcast";
}) {
  const visibleEntries = typeof topLimit === "number" ? entries.slice(0, topLimit) : entries;
  const extraRanks = [...new Set(highlightRanks.filter((r) => typeof r === "number"))];
  const rowClass =
    variant === "dramatic"
      ? "flex items-center justify-between rounded-[1.6rem] border px-7 py-6 transition"
      : variant === "broadcast"
        ? "flex items-center justify-between rounded-[1.2rem] border px-4 py-2.5 transition"
      : "flex items-center justify-between rounded-[1.4rem] border px-5 py-4 transition";
  const titleClass =
    variant === "dramatic"
      ? "font-display text-2xl font-black uppercase"
      : variant === "broadcast"
        ? "font-display text-base font-black uppercase tracking-[0.03em]"
      : "font-display text-lg font-black uppercase";
  const cityClass =
    variant === "dramatic"
      ? "text-base text-[color:var(--muted)]"
      : variant === "broadcast"
        ? "text-xs text-[color:var(--muted)]"
        : "text-sm text-[color:var(--muted)]";
  const pointsClass =
    variant === "dramatic"
      ? "font-display text-4xl font-black text-[color:var(--accent)]"
      : variant === "broadcast"
        ? "font-display text-2xl font-black text-[color:var(--accent)]"
      : "font-display text-2xl font-black text-[color:var(--accent)]";
  const pointsLabelClass =
    variant === "dramatic"
      ? "text-sm uppercase tracking-[0.3em] text-[color:var(--muted)]"
      : variant === "broadcast"
        ? "text-[10px] uppercase tracking-[0.3em] text-[color:var(--muted)]"
      : "text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]";
  const gridClass = variant === "broadcast" ? "grid gap-2" : "grid gap-3";
  const isBroadcast = variant === "broadcast";

  return (
    <div className={gridClass}>
      {visibleEntries.map((entry) => {
        const isRankOne = entry.rank === 1;
        const rowTone =
          isBroadcast && isRankOne
            ? "border-[color:var(--accent)]/75 bg-[linear-gradient(135deg,rgba(255,214,128,0.2),rgba(255,193,79,0.1))] shadow-[0_0_26px_rgba(255,214,128,0.2)]"
            : rankHighlightClass(entry.rank);

        return (
          <div
            className={`${rowClass} ${rowTone} ${isBroadcast && isRankOne ? "px-5 py-3.5" : ""}`}
            key={entry.playerId}
          >
            <div>
              <p className={`${titleClass} ${isBroadcast && isRankOne ? "text-lg" : ""}`}>
                <span className="inline-flex items-center gap-2">
                  {isBroadcast && isRankOne ? (
                    <CrownIcon className="size-4 text-[color:var(--accent)]" />
                  ) : null}
                  <span>
                    #{entry.rank} {entry.playerName}
                  </span>
                </span>
              </p>
              <p className={cityClass}>{entry.city}</p>
            </div>
            <div className="text-right">
              <p className={`${pointsClass} ${isBroadcast && isRankOne ? "text-3xl" : ""}`}>{entry.lifetimePoints}</p>
              <p className={pointsLabelClass}>puntos</p>
            </div>
          </div>
        );
      })}

      {showExtraRanks
        ? extraRanks.map((rank) => {
            if (!rank || visibleEntries.some((entry) => entry.rank === rank)) {
              return null;
            }
            return (
              <div
                className="rounded-[1.4rem] border border-[color:var(--accent-cool)]/25 bg-[color:var(--panel-soft)] px-5 py-4 text-sm text-[color:var(--foreground)]"
                key={`extra-${rank}`}
              >
                Tu posición no está en el top visible:{" "}
                <span className="font-display text-xl font-black">#{rank}</span>
              </div>
            );
          })
        : null}
    </div>
  );
}
