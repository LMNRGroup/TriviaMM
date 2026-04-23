import { CreateRoomButton } from "@/components/home/CreateRoomButton";

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-8 shadow-2xl shadow-black/40">
        <section className="space-y-6">
          <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">
            Trivia Battle MVP
          </p>
          <h1 className="max-w-3xl text-5xl font-black tracking-tight sm:text-7xl">
            React and TypeScript rebuild in progress.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[color:var(--muted)]">
            The new application is being built alongside the legacy prototype.
            Host and player room flows will live in dedicated routes instead of
            monolithic HTML files.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-[color:var(--panel-strong)] p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-[color:var(--accent)]">Host</p>
            <h2 className="mt-4 text-2xl font-bold">Create a Live Room</h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              Generates a new room code, stores the host token locally, and opens the host screen.
            </p>
            <div className="mt-6">
              <CreateRoomButton />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[color:var(--panel-strong)] p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-[color:var(--accent-strong)]">Player</p>
            <h2 className="mt-4 text-2xl font-bold">Scan the Host QR</h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              Player entry is routed through the QR code on the host screen. The join flow now includes registration, instructions, lobby, and live answer states.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
