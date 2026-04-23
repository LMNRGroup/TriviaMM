import { CreateRoomButton } from "@/components/home/CreateRoomButton";

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-8">
      <div className="app-shell glass-panel sweep-light battle-card mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col overflow-hidden rounded-[2.5rem] px-6 py-8 sm:px-10 sm:py-10">
        <div className="hero-mesh" />

        <section className="enter-rise relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-7">
            <div className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.45em] text-[color:var(--accent)]">
              Live Trivia Arena
            </div>

            <div className="space-y-5">
              <p className="font-display text-sm uppercase tracking-[0.4em] text-[color:var(--accent-cool)]">
                Fast. Loud. Competitive.
              </p>
              <h1 className="font-display max-w-4xl text-5xl font-black uppercase leading-[0.95] tracking-[0.06em] sm:text-7xl xl:text-[6.7rem]">
                Play me.
                <span className="mt-2 block text-[color:var(--accent)]">Bring the battle to the room.</span>
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[color:var(--muted)] sm:text-xl">
                This is not supposed to feel like a quiet quiz form. The new host and player flow is being shaped into a polished competitive experience with motion, tension, and momentum from QR scan to final ranking.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="glass-panel battle-card enter-scale rounded-[1.75rem] p-5">
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Live Room</p>
                <p className="font-display mt-3 text-3xl font-black text-[color:var(--accent)]">1 Host</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Big-screen stage built for a crowd.</p>
              </div>
              <div className="glass-panel battle-card enter-scale rounded-[1.75rem] p-5" style={{ animationDelay: "80ms" }}>
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Competitive Play</p>
                <p className="font-display mt-3 text-3xl font-black text-[color:var(--accent-cool)]">2 Players</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Solo grind or direct battle mode.</p>
              </div>
              <div className="glass-panel battle-card enter-scale rounded-[1.75rem] p-5" style={{ animationDelay: "160ms" }}>
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Pressure</p>
                <p className="font-display mt-3 text-3xl font-black text-[color:var(--accent-strong)]">15 Sec</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Every question feels timed and alive.</p>
              </div>
            </div>
          </div>

          <div className="enter-scale relative">
            <div className="glass-panel glow-accent rounded-[2rem] p-6">
              <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Operator Start</p>
              <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">Launch The Arena</h2>
              <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
                Generate a fresh room, show the QR on the host screen, and start pulling players into a sharper, more dramatic match flow.
              </p>
              <div className="mt-8">
                <CreateRoomButton />
              </div>
            </div>
          </div>
        </section>

        <section className="relative mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass-panel battle-card rounded-[2rem] p-6 enter-rise">
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">Player Experience</p>
            <h3 className="font-display mt-4 text-2xl font-black uppercase tracking-[0.08em]">Scan. Register. Smash Answers.</h3>
            <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
              Mobile entry is now built around registration, instructions, lobby readiness, giant answer controls, warnings, and result visibility instead of a generic phone controller.
            </p>
          </div>

          <div className="glass-panel battle-card rounded-[2rem] p-6 enter-rise">
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--accent-cool)]">Design Direction</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="font-display text-lg font-black uppercase">Clean</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Clear hierarchy, less flatness, more intention.</p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="font-display text-lg font-black uppercase">Alive</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Ambient motion, pulses, sweep lights, countdown energy.</p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="font-display text-lg font-black uppercase">Battle</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Sharper contrast, stronger typography, game-show tension.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
