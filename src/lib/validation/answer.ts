import { z } from "zod";

export const answerSubmissionSchema = z.object({
  playerId: z.string().trim().min(1),
  controllerToken: z.string().trim().min(1),
  questionId: z.string().trim().min(1),
  questionIndex: z.number().int().min(0),
  selectedChoice: z.union([z.literal("A"), z.literal("B"), z.literal("C"), z.literal("D")]),
});

export type AnswerSubmissionInput = z.infer<typeof answerSubmissionSchema>;

export const presenceSchema = z.object({
  actorType: z.union([z.literal("host"), z.literal("player")]),
  actorId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});
