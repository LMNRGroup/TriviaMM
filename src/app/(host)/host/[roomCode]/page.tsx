import { redirect } from "next/navigation";

/** TODO: Multi-room — today the public arena uses fixed `PUBLICO` and `/host`; wire per-room host when room creation is implemented. */
export default function HostRoomPage() {
  redirect("/host");
}
