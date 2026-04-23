import { randomBytes, randomUUID } from "node:crypto";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createSessionId() {
  return randomUUID();
}

export function createHostToken() {
  return `host_${randomUUID()}`;
}

export function createRoomCode(length = 6) {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    const offset = randomBytes(1)[0] % ROOM_ALPHABET.length;
    value += ROOM_ALPHABET[offset];
  }

  return value;
}
