import { PlayerRoomClient } from "@/components/player/PlayerRoomClient";

export default function PlayPage() {
  return (
    <main className="min-h-screen px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-xl flex-col rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-4 sm:p-6">
        <PlayerRoomClient />
      </div>
    </main>
  );
}
