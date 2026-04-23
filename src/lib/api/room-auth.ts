import type { Player, RoomState } from "@/lib/types/game";

export function requireHost(room: RoomState, hostToken: string) {
  return room.hostToken === hostToken;
}

export function findPlayerById(room: RoomState, playerId: string) {
  if (room.players.player1?.playerId === playerId) {
    return room.players.player1;
  }

  if (room.players.player2?.playerId === playerId) {
    return room.players.player2;
  }

  return null;
}

export function requirePlayerToken(player: Player | null, controllerToken: string) {
  return player?.controllerToken === controllerToken;
}
