import { randomUUID } from "node:crypto";
import { getUniversityByName } from "@/lib/data/universities";
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
  university: string,
];

interface RegisteredPlayerRecord {
  playerId: string;
  name: string;
  city: string;
  university: string;
  age: number;
  email: string;
  acceptedTermsAt: string;
  newsletterOptIn: boolean;
  registeredAt: string;
  lastRegisteredAt: string;
}

const fallbackPlayers = new Map<string, RegisteredPlayerRecord>();

function normalizeHandleSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim();
}

function buildHandleBase(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => normalizeHandleSegment(part))
    .filter((part) => part.length > 0);
  const first = parts[0] ?? "Player";
  const last = parts.length > 1 ? parts[parts.length - 1] : "User";

  const firstTitle = `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}`;
  const lastTitle = `${last.charAt(0).toUpperCase()}${last.slice(1).toLowerCase()}`;

  return `${firstTitle}${lastTitle}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUniquePlayerName(name: string, universityAcronym: string, existingNames: string[]) {
  const base = buildHandleBase(name);
  const scopedPattern = new RegExp(
    `^${escapeRegex(base)}(\\d{2})#${escapeRegex(universityAcronym)}$`,
    "i",
  );
  const usedNumbers = new Set<number>();

  for (const existingName of existingNames) {
    const match = existingName.match(scopedPattern);
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 99) {
      usedNumbers.add(parsed);
    }
  }

  const available: number[] = [];
  for (let value = 0; value <= 99; value += 1) {
    if (!usedNumbers.has(value)) {
      available.push(value);
    }
  }

  const selected = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : Math.floor(Math.random() * 100);

  return `${base}${String(selected).padStart(2, "0")}#${universityAcronym}`;
}

function buildPlayerRow(input: RegistrationInput, playerId: string, timestamp: string, generatedName: string): PlayerSheetRow {
  const university = getUniversityByName(input.university);
  const universityAcronym = university?.acronym ?? input.university;

  return [
    playerId,
    generatedName,
    universityAcronym,
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
    input.university,
  ];
}

function mapRowToRegistrationPlayer(row: string[]) {
  const location = row[2] ?? "";
  return {
    playerId: row[0] ?? "",
    name: row[1] ?? "",
    city: location,
    university: row[16] ?? location,
    age: Number(row[3] ?? 0),
    email: row[4] ?? "",
    acceptedTermsAt: row[5] ?? "",
    newsletterOptIn: row[6] === "true",
    registeredAt: row[7] ?? "",
    lastRegisteredAt: row[8] ?? "",
  };
}

async function readPlayerRows() {
  if (!hasSheetsConfig()) {
    return [] as string[][];
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("players");
  const range = await getSheetRange("players", "A:Q");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId("players"),
    range,
  });

  const rows = response.data.values ?? [];
  return rows[0]?.[0] === "player_id" ? rows.slice(1) : rows;
}

export async function createRegisteredPlayer(input: RegistrationInput) {
  const playerId = randomUUID();
  const timestamp = new Date().toISOString();
  const university = getUniversityByName(input.university);
  const universityAcronym = university?.acronym ?? "UNI";
  const existingNames = hasSheetsConfig()
    ? (await readPlayerRows()).map((row) => row[1] ?? "").filter((value) => value.length > 0)
    : Array.from(fallbackPlayers.values()).map((player) => player.name);
  const generatedName = buildUniquePlayerName(input.name, universityAcronym, existingNames);

  if (hasSheetsConfig()) {
    const sheets = getSheetsClient();
    await ensureSheetHeaders("players");
    const range = await getSheetRange("players", "A:Q");

    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId("players"),
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [buildPlayerRow(input, playerId, timestamp, generatedName)],
      },
    });
  } else {
    fallbackPlayers.set(playerId, {
      playerId,
      name: generatedName,
      city: universityAcronym,
      university: input.university,
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
    name: generatedName,
    city: universityAcronym,
    university: input.university,
  };
}

export async function getRegisteredPlayerById(playerId: string) {
  if (!hasSheetsConfig()) {
    return fallbackPlayers.get(playerId) ?? null;
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("players");
  const range = await getSheetRange("players", "A:Q");
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

  const dataRows = await readPlayerRows();
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
    university: registration.university,
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
