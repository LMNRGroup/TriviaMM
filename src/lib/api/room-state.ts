import type { RoomState } from "@/lib/types/game";

export function sanitizeRoomState(room: RoomState): RoomState {
  return {
    ...room,
    hostToken: "",
    players: {
      player1: room.players.player1
        ? {
            ...room.players.player1,
            controllerToken: "",
            email: "",
          }
        : null,
      player2: room.players.player2
        ? {
            ...room.players.player2,
            controllerToken: "",
            email: "",
          }
        : null,
    },
  };
}
