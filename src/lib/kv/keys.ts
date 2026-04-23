export const ROOM_TTL_SECONDS = 60 * 60 * 2;
export const PRESENCE_TTL_SECONDS = 60;
export const LOCK_TTL_SECONDS = 10;

export function roomMetaKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:meta`;
}

export function roomStateKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:state`;
}

export function roomHostKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:host`;
}

export function roomPlayersKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:players`;
}

export function roomPlayerKey(roomCode: string, playerId: string) {
  return `trivia:rooms:${roomCode}:player:${playerId}`;
}

export function roomPresenceKey(roomCode: string, playerId: string) {
  return `trivia:rooms:${roomCode}:presence:${playerId}`;
}

export function roomMatchKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:match:active`;
}

export function roomQuestionOrderKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:question-order`;
}

export function roomQuestionBankKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:question-bank`;
}

export function roomAnswerKey(roomCode: string, questionIndex: number, playerId: string) {
  return `trivia:rooms:${roomCode}:answer:${questionIndex}:${playerId}`;
}

export function roomEventsSeqKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:events:seq`;
}

export function roomLockKey(roomCode: string) {
  return `trivia:rooms:${roomCode}:lock`;
}

export function activeRoomsIndexKey() {
  return "trivia:rooms:index:active";
}
