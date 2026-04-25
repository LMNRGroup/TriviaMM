import type { Player, PublicRoomState } from "@/lib/types/game";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: string;
  message?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface CreateRoomResponse {
  roomCode: string;
  hostToken: string;
  hostSessionId: string;
  playUrl: string;
  qrUrl: string;
}

export interface RoomStateResponse {
  room: PublicRoomState;
  serverTime: string;
}

export interface RegistrationResponse {
  player: Pick<Player, "playerId" | "name" | "city">;
}
