import { randomUUID } from "node:crypto";
import type { Player } from "@/lib/types/game";
import type { RegistrationInput } from "@/lib/validation/registration";
import { getSheetsClient, getSpreadsheetId } from "@/lib/sheets/client";
import { SHEETS_TABS } from "@/lib/sheets/tabs";
import { hasSheetsConfig } from "@/lib/utils/env";

type PlayerSheetRow = [
  playerId: string,
  name: string,
  country: string,
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
  country: string;
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
    input.country,
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
  return {
    playerId: row[0] ?? "",
    name: row[1] ?? "",
    country: row[2] ?? "",
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

    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: `${SHEETS_TABS.players}!A:P`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [buildPlayerRow(input, playerId, timestamp)],
      },
    });
  } else {
    fallbackPlayers.set(playerId, {
      playerId,
      name: input.name,
      country: input.country,
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
    country: input.country,
    email: input.email,
  };
}

export async function getRegisteredPlayerById(playerId: string) {
  if (!hasSheetsConfig()) {
    return fallbackPlayers.get(playerId) ?? null;
  }

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEETS_TABS.players}!A:P`,
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
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEETS_TABS.players}!A:P`,
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
    country: registration.country,
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
  };
}
