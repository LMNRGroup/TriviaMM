import { HostRoomClient } from "@/components/host/HostRoomClient";

interface HostRoomPageProps {
  params: Promise<{ roomCode: string }>;
}

export default async function HostRoomPage({ params }: HostRoomPageProps) {
  const { roomCode } = await params;

  return (
    <main className="min-h-screen px-6 py-8">
      <HostRoomClient roomCode={roomCode} />
    </main>
  );
}
