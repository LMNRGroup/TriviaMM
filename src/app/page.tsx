import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-8">
      <div className="app-shell glass-panel sweep-light battle-card mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col overflow-hidden rounded-[2.5rem] px-6 py-8 sm:px-10 sm:py-10">
        <div className="hero-mesh" />

        <section className="enter-rise relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-7">
            <div className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.45em] text-[color:var(--accent)]">
              Arena en vivo
            </div>

            <div className="space-y-5">
              <p className="font-display text-sm uppercase tracking-[0.4em] text-[color:var(--accent-cool)]">
                Directo. Intenso. Competitivo.
              </p>
              <h1 className="font-display max-w-4xl text-5xl font-black uppercase leading-[0.95] tracking-[0.06em] sm:text-7xl xl:text-[6.7rem]">
                Juega conmigo.
                <span className="mt-2 block text-[color:var(--accent)]">Convierte el salón en una batalla.</span>
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[color:var(--muted)] sm:text-xl">
                Esta experiencia está pensada para una pantalla grande y celulares en vivo: escaneo inmediato, tensión visual, respuestas rápidas y una tabla final que invite a competir otra vez.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="glass-panel battle-card enter-scale rounded-[1.75rem] p-5">
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Pantalla</p>
                <p className="font-display mt-3 text-3xl font-black text-[color:var(--accent)]">1920×1080</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Diseñada para proyectarse ante mucha gente.</p>
              </div>
              <div className="glass-panel battle-card enter-scale rounded-[1.75rem] p-5" style={{ animationDelay: "80ms" }}>
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Modo</p>
                <p className="font-display mt-3 text-3xl font-black text-[color:var(--accent-cool)]">1 o 2</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Partida individual o duelo en vivo.</p>
              </div>
              <div className="glass-panel battle-card enter-scale rounded-[1.75rem] p-5" style={{ animationDelay: "160ms" }}>
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Presión</p>
                <p className="font-display mt-3 text-3xl font-black text-[color:var(--accent-strong)]">10 + 15s</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Lectura primero, respuesta después.</p>
              </div>
            </div>
          </div>

          <div className="enter-scale relative">
            <div className="glass-panel glow-accent rounded-[2rem] p-6">
              <p className="font-display text-sm uppercase tracking-[0.35em] text-[color:var(--accent)]">Entradas fijas</p>
              <h2 className="font-display mt-4 text-3xl font-black uppercase tracking-[0.08em]">Abre la arena</h2>
              <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
                Ya no dependemos de URLs dinámicas. La pantalla principal vive en una dirección fija y el jugador entra desde otra.
              </p>
              <div className="mt-8 grid gap-3">
                <Link
                  className="font-display pulse-ring relative rounded-[1.5rem] bg-[linear-gradient(135deg,var(--accent),#ffd77a)] px-6 py-4 text-left text-lg font-black uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:brightness-105"
                  href="/host"
                >
                  Abrir pantalla principal
                </Link>
                <Link
                  className="rounded-[1.5rem] border border-white/10 bg-white/5 px-6 py-4 text-left text-sm uppercase tracking-[0.18em] text-[color:var(--foreground)] transition hover:border-[color:var(--accent-cool)] hover:bg-white/7"
                  href="/play"
                >
                  Abrir control móvil
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass-panel battle-card rounded-[2rem] p-6 enter-rise">
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--accent-strong)]">Experiencia móvil</p>
            <h3 className="font-display mt-4 text-2xl font-black uppercase tracking-[0.08em]">Escanea. Regístrate. Responde.</h3>
            <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">
              El celular se usa como control real del juego: registro, lobby, lectura, respuestas gigantes y feedback inmediato.
            </p>
          </div>

          <div className="glass-panel battle-card rounded-[2rem] p-6 enter-rise">
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--accent-cool)]">Dirección visual</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="font-display text-lg font-black uppercase">Limpio</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Jerarquía clara y presencia premium.</p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="font-display text-lg font-black uppercase">Vivo</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Movimiento ambiental, pulsos y energía constante.</p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="font-display text-lg font-black uppercase">Batalla</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Contraste fuerte, tensión y presencia de show.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
