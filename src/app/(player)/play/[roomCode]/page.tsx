import { redirect } from "next/navigation";

/** TODO: Multi-room — today controllers use `/play` with the public arena; wire per-room join URLs when dynamic rooms ship. */
export default function PlayerRoomPage() {
  redirect("/play");
}
