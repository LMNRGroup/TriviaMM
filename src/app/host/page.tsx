import { HostStage } from "@/components/host/HostStage";
import { HostRoomClient } from "@/components/host/HostRoomClient";

export default function HostPage() {
  return (
    <HostStage>
      <HostRoomClient />
    </HostStage>
  );
}
