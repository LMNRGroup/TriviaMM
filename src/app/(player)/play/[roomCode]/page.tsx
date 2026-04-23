import { PlayerRoomClient } from "@/components/player/PlayerRoomClient";

interface PlayerRoomPageProps {
  params: Promise<{ roomCode: string }>;
}

export default async function PlayerRoomPage({ params }: PlayerRoomPageProps) {
  const { roomCode } = await params;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col rounded-[2rem] border border-white/10 bg-[color:var(--panel)] p-6 sm:p-8">
        <PlayerRoomClient roomCode={roomCode} />
      </div>
    </main>
  );
}
