import { BugFinderOverlay } from "@/components/debug/BugFinderOverlay";
import { HostRoomClient } from "@/components/host/HostRoomClient";

export default function HostPage() {
  return (
    <main className="display-viewport">
      <section className="display-stage">
        <div className="display-canvas">
          <HostRoomClient />
        </div>
      </section>
      <BugFinderOverlay />
    </main>
  );
}
