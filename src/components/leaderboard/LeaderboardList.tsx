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

export function LeaderboardList({
  entries,
  highlightRanks = [],
}: {
  entries: PublicLeaderboardEntry[];
  /** Any rank value (e.g. current players) to emphasize if missing from `entries`. */
  highlightRanks?: number[];
}) {
  const extraRanks = [...new Set(highlightRanks.filter((r) => typeof r === "number"))];

  return (
    <div className="grid gap-3">
      {entries.map((entry) => (
        <div
          className={`flex items-center justify-between rounded-[1.4rem] border px-5 py-4 transition ${rankHighlightClass(entry.rank)}`}
          key={entry.playerId}
        >
          <div>
            <p className="font-display text-lg font-black uppercase">
              #{entry.rank} {entry.playerName}
            </p>
            <p className="text-sm text-[color:var(--muted)]">{entry.city}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-black text-[color:var(--accent)]">{entry.lifetimePoints}</p>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">puntos</p>
          </div>
        </div>
      ))}

      {extraRanks.map((rank) => {
        if (!rank || entries.some((e) => e.rank === rank)) {
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
      })}
    </div>
  );
}
