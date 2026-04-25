import type { Question } from "@/lib/types/game";
import { SAMPLE_QUESTIONS } from "@/lib/game/sample-questions";
import { ensureSheetHeaders } from "@/lib/sheets/bootstrap";
import { hasSheetsConfig } from "@/lib/utils/env";
import { getSheetRange, getSheetsClient, getSpreadsheetId } from "@/lib/sheets/client";

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }

  return copy;
}

function parseQuestionRow(row: string[]): Question | null {
  if (!row[0] || !row[2] || !row[7]) {
    return null;
  }

  const isActive = (row[11] ?? "true").toLowerCase() !== "false";

  if (!isActive) {
    return null;
  }

  return {
    questionId: row[0],
    sourceRowId: row[1] ?? row[0],
    prompt: row[2],
    choices: {
      A: row[3] ?? "",
      B: row[4] ?? "",
      C: row[5] ?? "",
      D: row[6] ?? "",
    },
    correctChoice: (row[7] ?? "A") as Question["correctChoice"],
    category: row[8] || undefined,
    difficulty: (row[9] as Question["difficulty"]) || undefined,
    tags: row[10] ? row[10].split(",").map((value) => value.trim()).filter(Boolean) : undefined,
    isActive,
  };
}

export async function getActiveQuestions() {
  if (!hasSheetsConfig()) {
    return SAMPLE_QUESTIONS;
  }

  try {
    const sheets = getSheetsClient();
    await ensureSheetHeaders("questions");
    const range = await getSheetRange("questions", "A:N");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId("questions"),
      range,
    });

    const rows = response.data.values ?? [];
    const [, ...dataRows] = rows;
    const parsed = dataRows.map(parseQuestionRow).filter((question): question is Question => question !== null);

    return parsed.length > 0 ? parsed : SAMPLE_QUESTIONS;
  } catch (error) {
    console.error("question fetch error", error);
    return SAMPLE_QUESTIONS;
  }
}

export async function getRandomQuestions(count: number) {
  const questions = await getActiveQuestions();
  return shuffle(questions).slice(0, Math.min(count, questions.length));
}
