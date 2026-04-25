import type { LeaderboardEntry } from "@/lib/types/game";
import { hasSheetsConfig } from "@/lib/utils/env";
import { getSheetsClient, getSpreadsheetId } from "@/lib/sheets/client";
import { SHEETS_TABS } from "@/lib/sheets/tabs";

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
    lifetimePoints: Number(row[8] ?? 0),
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
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEETS_TABS.leaderboard}!A:L`,
  });

  const rows = response.data.values ?? [];
  const [, ...dataRows] = rows;

  return dataRows.map(parseLeaderboardRow).filter((entry): entry is LeaderboardEntry => entry !== null);
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

export async function upsertLeaderboardEntry(input: {
  playerId: string;
  playerName: string;
  country: string;
  matchScore: number;
  mode: "solo" | "battle";
  won: boolean;
  averageResponseMs: number | null;
}) {
  if (!hasSheetsConfig()) {
    return;
  }

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEETS_TABS.leaderboard}!A:L`,
  });

  const rows = response.data.values ?? [];
  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const rowIndex = dataRows.findIndex((row) => row[1] === input.playerId);
  const timestamp = new Date().toISOString();
  const existing = rowIndex >= 0 ? parseLeaderboardRow(dataRows[rowIndex]) : null;

  const updated: LeaderboardEntry = {
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
    lifetimePoints: (existing?.lifetimePoints ?? 0) + input.matchScore,
    averageResponseMs:
      input.averageResponseMs === null
        ? existing?.averageResponseMs ?? null
        : existing?.averageResponseMs === null || existing?.averageResponseMs === undefined
          ? input.averageResponseMs
          : Math.round((existing.averageResponseMs + input.averageResponseMs) / 2),
    rank: existing?.rank ?? 0,
    updatedAt: timestamp,
  };

  const targetRow = toLeaderboardRow(updated);

  if (rowIndex >= 0) {
    const absoluteRow = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSpreadsheetId(),
      range: `${SHEETS_TABS.leaderboard}!A${absoluteRow}:L${absoluteRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [targetRow],
      },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: `${SHEETS_TABS.leaderboard}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [header.length === 0 ? targetRow : targetRow],
      },
    });
  }
}
