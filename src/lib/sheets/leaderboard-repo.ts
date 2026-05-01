import type { LeaderboardEntry } from "@/lib/types/game";
import { ensureSheetHeaders } from "@/lib/sheets/bootstrap";
import { hasSheetsConfig } from "@/lib/utils/env";
import { getSheetRange, getSheetsClient, getSpreadsheetId } from "@/lib/sheets/client";

type LeaderboardSheetRow = [
  leaderboardEntryId: string,
  playerId: string,
  playerName: string,
  country: string,
  matchesPlayed: string,
  wins: string,
  soloBestScore: string,
  battleBestScore: string,
  lifetimePoints: string,
  averageResponseMs: string,
  rank: string,
  updatedAt: string,
];

export interface LeaderboardUpsertInput {
  playerId: string;
  playerName: string;
  country: string;
  matchScore: number;
  mode: "solo" | "battle";
  won: boolean;
  averageResponseMs: number | null;
}

function rankEntries(entries: LeaderboardEntry[]) {
  return [...entries]
    .sort((left, right) => {
      if (right.lifetimePoints !== left.lifetimePoints) {
        return right.lifetimePoints - left.lifetimePoints;
      }

      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }

      if (right.soloBestScore !== left.soloBestScore) {
        return right.soloBestScore - left.soloBestScore;
      }

      if (right.battleBestScore !== left.battleBestScore) {
        return right.battleBestScore - left.battleBestScore;
      }

      if (left.averageResponseMs !== null && right.averageResponseMs !== null && left.averageResponseMs !== right.averageResponseMs) {
        return left.averageResponseMs - right.averageResponseMs;
      }

      if (left.averageResponseMs !== null && right.averageResponseMs === null) {
        return -1;
      }

      if (left.averageResponseMs === null && right.averageResponseMs !== null) {
        return 1;
      }

      return left.playerName.localeCompare(right.playerName);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function parseLeaderboardRow(row: string[]): LeaderboardEntry | null {
  if (!row[1] || !row[2]) {
    return null;
  }

  return {
    leaderboardEntryId: row[0] ?? row[1],
    playerId: row[1],
    playerName: row[2],
    country: row[3] ?? "",
    matchesPlayed: Number(row[4] ?? 0),
    wins: Number(row[5] ?? 0),
    soloBestScore: Number(row[6] ?? 0),
    battleBestScore: Number(row[7] ?? 0),
    lifetimePoints: Math.min(Number(row[8] ?? 0), 10),
    averageResponseMs: row[9] ? Number(row[9]) : null,
    rank: Number(row[10] ?? 0),
    updatedAt: row[11] ?? new Date().toISOString(),
  };
}

function toLeaderboardRow(entry: LeaderboardEntry): LeaderboardSheetRow {
  return [
    entry.leaderboardEntryId,
    entry.playerId,
    entry.playerName,
    entry.country,
    String(entry.matchesPlayed),
    String(entry.wins),
    String(entry.soloBestScore),
    String(entry.battleBestScore),
    String(entry.lifetimePoints),
    entry.averageResponseMs === null ? "" : String(entry.averageResponseMs),
    String(entry.rank),
    entry.updatedAt,
  ];
}

async function readLeaderboardRows() {
  if (!hasSheetsConfig()) {
    return [] as LeaderboardEntry[];
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("leaderboard");
  const range = await getSheetRange("leaderboard", "A:L");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId("leaderboard"),
    range,
  });

  const rows = response.data.values ?? [];
  const [, ...dataRows] = rows;

  return dataRows.map(parseLeaderboardRow).filter((entry): entry is LeaderboardEntry => entry !== null);
}

function buildUpdatedEntry(
  existing: LeaderboardEntry | null,
  input: LeaderboardUpsertInput,
  timestamp: string,
): LeaderboardEntry {
  return {
    leaderboardEntryId: existing?.leaderboardEntryId ?? input.playerId,
    playerId: input.playerId,
    playerName: input.playerName,
    country: input.country,
    matchesPlayed: (existing?.matchesPlayed ?? 0) + 1,
    wins: (existing?.wins ?? 0) + (input.won ? 1 : 0),
    soloBestScore:
      input.mode === "solo"
        ? Math.max(existing?.soloBestScore ?? 0, input.matchScore)
        : existing?.soloBestScore ?? 0,
    battleBestScore:
      input.mode === "battle"
        ? Math.max(existing?.battleBestScore ?? 0, input.matchScore)
        : existing?.battleBestScore ?? 0,
    lifetimePoints: Math.max(Math.min(existing?.lifetimePoints ?? 0, 10), input.matchScore),
    averageResponseMs:
      input.averageResponseMs === null
        ? existing?.averageResponseMs ?? null
        : existing?.averageResponseMs === null || existing?.averageResponseMs === undefined
          ? input.averageResponseMs
          : Math.round(
              ((existing.averageResponseMs * (existing.matchesPlayed ?? 0)) + input.averageResponseMs) /
                ((existing.matchesPlayed ?? 0) + 1),
            ),
    rank: existing?.rank ?? 0,
    updatedAt: timestamp,
  };
}

function dedupeUpsertInputs(inputs: LeaderboardUpsertInput[]) {
  const byPlayerId = new Map<string, LeaderboardUpsertInput>();
  for (const input of inputs) {
    byPlayerId.set(input.playerId, input);
  }
  return [...byPlayerId.values()];
}

export async function listLeaderboard(limit = 10) {
  const entries = await readLeaderboardRows();
  return rankEntries(entries).slice(0, limit);
}

export async function getPlayerLeaderboardRank(playerId: string) {
  const entries = await readLeaderboardRows();
  const ranked = rankEntries(entries);
  return ranked.find((entry) => entry.playerId === playerId) ?? null;
}

export async function getLeaderboardSnapshot(input: { limit?: number; playerIds?: string[] } = {}) {
  const limit = input.limit ?? 10;
  const playerIds = input.playerIds ?? [];
  const ranked = rankEntries(await readLeaderboardRows());

  const ranksByPlayerId = new Map<string, number>();
  for (const playerId of playerIds) {
    const row = ranked.find((entry) => entry.playerId === playerId);
    if (row) {
      ranksByPlayerId.set(playerId, row.rank);
    }
  }

  return {
    top: ranked.slice(0, limit),
    ranksByPlayerId,
  };
}

export async function upsertLeaderboardEntries(inputs: LeaderboardUpsertInput[]) {
  if (!hasSheetsConfig()) {
    return;
  }

  const dedupedInputs = dedupeUpsertInputs(inputs);
  if (dedupedInputs.length === 0) {
    return;
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("leaderboard");
  const range = await getSheetRange("leaderboard", "A:L");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId("leaderboard"),
    range,
  });

  const rows = response.data.values ?? [];
  const dataRows = rows.slice(1);
  const byPlayerId = new Map<string, { entry: LeaderboardEntry; rowIndex: number }>();

  for (let index = 0; index < dataRows.length; index += 1) {
    const parsed = parseLeaderboardRow(dataRows[index]);
    if (!parsed) {
      continue;
    }
    byPlayerId.set(parsed.playerId, {
      entry: parsed,
      rowIndex: index,
    });
  }

  const timestamp = new Date().toISOString();
  for (const input of dedupedInputs) {
    const existing = byPlayerId.get(input.playerId) ?? null;
    const updated = buildUpdatedEntry(existing?.entry ?? null, input, timestamp);
    const targetRow = toLeaderboardRow(updated);

    if (existing) {
      const absoluteRow = existing.rowIndex + 2;
      const updateRange = await getSheetRange("leaderboard", `A${absoluteRow}:L${absoluteRow}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId("leaderboard"),
        range: updateRange,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [targetRow],
        },
      });
      continue;
    }

    const appendRange = await getSheetRange("leaderboard", "A:L");
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId("leaderboard"),
      range: appendRange,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [targetRow],
      },
    });
  }
}

export async function upsertLeaderboardEntry(input: LeaderboardUpsertInput) {
  await upsertLeaderboardEntries([input]);
}
