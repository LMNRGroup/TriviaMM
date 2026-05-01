import { PlayerRoomClient } from "@/components/player/PlayerRoomClient";

export default function PlayPage() {
  return (
    <main className="player-viewport">
      <div className="player-shell">
        <div className="player-content">
          <PlayerRoomClient />
        </div>
        <p className="player-legal">
          <span className="block">© 2026 Luminar Apps. Todos los derechos reservados.</span>
          <span className="block">Desarrollado para Municipio Autónomo de Mayagüez.</span>
        </p>
      </div>
    </main>
  );
}
