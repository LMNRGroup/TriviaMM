import { BugFinderOverlay } from "@/components/debug/BugFinderOverlay";
import { PlayerRoomClient } from "@/components/player/PlayerRoomClient";

export default function PlayPage() {
  return (
    <main className="min-h-screen px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-xl flex-col rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-4 sm:p-6">
        <div className="flex min-h-0 flex-1 flex-col">
          <PlayerRoomClient />
        </div>
        <BugFinderOverlay />
        <p className="mt-4 border-t border-white/10 pt-3 text-center text-[0.48rem] uppercase leading-tight tracking-[0.08em] text-[color:var(--muted)] sm:text-[0.54rem]">
          <span className="block whitespace-nowrap">© 2026 Luminar Apps. Todos los derechos reservados.</span>
          <span className="block whitespace-nowrap">Desarrollado para Municipio Autónomo de Mayagüez.</span>
        </p>
      </div>
    </main>
  );
}
