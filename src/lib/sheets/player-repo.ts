import { randomUUID } from "node:crypto";
import type { Player } from "@/lib/types/game";
import type { RegistrationInput } from "@/lib/validation/registration";
import { ensureSheetHeaders } from "@/lib/sheets/bootstrap";
import { getSheetRange, getSheetsClient, getSpreadsheetId } from "@/lib/sheets/client";
import { hasSheetsConfig } from "@/lib/utils/env";

type PlayerSheetRow = [
  playerId: string,
  name: string,
  city: string,
  age: string,
  email: string,
  acceptedTermsAt: string,
  newsletterOptIn: string,
  firstRegisteredAt: string,
  lastRegisteredAt: string,
  totalMatches: string,
  totalWins: string,
  lifetimePoints: string,
  bestSoloScore: string,
  bestBattleScore: string,
  averageResponseMs: string,
  lastRoomCode: string,
];

interface RegisteredPlayerRecord {
  playerId: string;
  name: string;
  city: string;
  age: number;
  email: string;
  acceptedTermsAt: string;
  newsletterOptIn: boolean;
  registeredAt: string;
  lastRegisteredAt: string;
}

const fallbackPlayers = new Map<string, RegisteredPlayerRecord>();

function buildPlayerRow(input: RegistrationInput, playerId: string, timestamp: string): PlayerSheetRow {
  return [
    playerId,
    input.name,
    input.city,
    String(input.age),
    input.email,
    timestamp,
    String(input.newsletterOptIn),
    timestamp,
    timestamp,
    "0",
    "0",
    "0",
    "0",
    "0",
    "",
    input.roomCode,
  ];
}

function mapRowToRegistrationPlayer(row: string[]) {
  const location = row[2] ?? "";
  return {
    playerId: row[0] ?? "",
    name: row[1] ?? "",
    city: location,
    age: Number(row[3] ?? 0),
    email: row[4] ?? "",
    acceptedTermsAt: row[5] ?? "",
    newsletterOptIn: row[6] === "true",
    registeredAt: row[7] ?? "",
    lastRegisteredAt: row[8] ?? "",
  };
}

export async function createRegisteredPlayer(input: RegistrationInput) {
  const playerId = randomUUID();
  const timestamp = new Date().toISOString();

  if (hasSheetsConfig()) {
    const sheets = getSheetsClient();
    await ensureSheetHeaders("players");
    const range = await getSheetRange("players", "A:P");

    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId("players"),
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [buildPlayerRow(input, playerId, timestamp)],
      },
    });
  } else {
    fallbackPlayers.set(playerId, {
      playerId,
      name: input.name,
      city: input.city,
      age: input.age,
      email: input.email,
      acceptedTermsAt: timestamp,
      newsletterOptIn: input.newsletterOptIn,
      registeredAt: timestamp,
      lastRegisteredAt: timestamp,
    });
  }

  return {
    playerId,
    name: input.name,
    city: input.city,
  };
}

export async function getRegisteredPlayerById(playerId: string) {
  if (!hasSheetsConfig()) {
    return fallbackPlayers.get(playerId) ?? null;
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("players");
  const range = await getSheetRange("players", "A:P");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId("players"),
    range,
  });

  const rows = response.data.values ?? [];
  const dataRows = rows[0]?.[0] === "player_id" ? rows.slice(1) : rows;
  const found = dataRows.find((row) => row[0] === playerId);

  if (!found) {
    return null;
  }

  return mapRowToRegistrationPlayer(found);
}

export async function findRegisteredPlayerByEmail(email: string) {
  if (!hasSheetsConfig()) {
    return Array.from(fallbackPlayers.values()).find((player) => player.email === email) ?? null;
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("players");
  const range = await getSheetRange("players", "A:P");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId("players"),
    range,
  });

  const rows = response.data.values ?? [];
  const dataRows = rows[0]?.[0] === "player_id" ? rows.slice(1) : rows;
  const found = dataRows.find((row) => (row[4] ?? "").toLowerCase() === email.toLowerCase());

  if (!found) {
    return null;
  }

  return mapRowToRegistrationPlayer(found);
}

export function buildLivePlayerFromRegistration({
  roomCode,
  slot,
  sessionId,
  controllerToken,
  registration,
}: {
  roomCode: string;
  slot: 1 | 2;
  sessionId: string;
  controllerToken: string;
  registration: Awaited<ReturnType<typeof getRegisteredPlayerById>>;
}): Player {
  if (!registration) {
    throw new Error("Registration record is required to build player");
  }

  const now = new Date().toISOString();

  return {
    playerId: registration.playerId,
    roomCode,
    slot,
    name: registration.name,
    city: registration.city,
    age: registration.age,
    email: registration.email,
    acceptedTermsAt: registration.acceptedTermsAt,
    newsletterOptIn: registration.newsletterOptIn,
    registeredAt: registration.registeredAt,
    status: "connected",
    sessionId,
    controllerToken,
    connectedAt: now,
    lastSeenAt: now,
    unansweredStreak: 0,
    totalScore: 0,
    correctCount: 0,
    wrongCount: 0,
    timeoutCount: 0,
    matchResponseTimeSumMs: 0,
    matchResponseTimeCount: 0,
  };
}
