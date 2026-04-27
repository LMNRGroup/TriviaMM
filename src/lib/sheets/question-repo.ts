import type { Question } from "@/lib/types/game";
import { ROUND_CATEGORY_PLAN, SAMPLE_QUESTIONS } from "@/lib/game/sample-questions";
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
    categoryOrder: row[12] ? Number(row[12]) : undefined,
    category: row[8] || undefined,
    explanation: row[13] || undefined,
    difficulty: (row[9] as Question["difficulty"]) || undefined,
    tags: row[10] ? row[10].split(",").map((value) => value.trim()).filter(Boolean) : undefined,
    isActive,
  };
}

function toSheetQuestionRow(question: Question) {
  return [
    question.questionId,
    question.sourceRowId,
    question.prompt,
    question.choices.A,
    question.choices.B,
    question.choices.C,
    question.choices.D,
    question.correctChoice,
    question.category ?? "",
    question.difficulty ?? "",
    question.tags?.join(", ") ?? "",
    String(question.isActive),
    question.categoryOrder === undefined ? "" : String(question.categoryOrder),
    question.explanation ?? "",
  ];
}

async function seedQuestionsSheetIfEmpty() {
  const sheets = getSheetsClient();
  const range = await getSheetRange("questions", "A:N");
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId("questions"),
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: SAMPLE_QUESTIONS.map(toSheetQuestionRow),
    },
  });
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

    if (parsed.length > 0) {
      return parsed;
    }

    await seedQuestionsSheetIfEmpty();
    return SAMPLE_QUESTIONS;
  } catch (error) {
    console.error("question fetch error", error);
    return SAMPLE_QUESTIONS;
  }
}

function buildCategoryRoundQuestions(questions: Question[], count: number) {
  const selected: Question[] = [];

  for (const plan of ROUND_CATEGORY_PLAN) {
    const categoryQuestions = shuffle(
      questions.filter((question) => question.isActive && question.category === plan.category),
    );

    if (categoryQuestions.length < plan.count) {
      throw new Error(`Not enough questions for category: ${plan.category}`);
    }

    selected.push(...categoryQuestions.slice(0, plan.count));
  }

  return selected.slice(0, Math.min(count, selected.length));
}

export async function getRandomQuestions(count: number) {
  const questions = await getActiveQuestions();

  try {
    return buildCategoryRoundQuestions(questions, count);
  } catch (error) {
    console.error("category round build error", error);
    return shuffle(questions).slice(0, Math.min(count, questions.length));
  }
}
