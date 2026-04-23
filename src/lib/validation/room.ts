import { z } from "zod";

export const roomCodeSchema = z
  .string()
  .trim()
  .min(4)
  .max(12)
  .regex(/^[A-Z0-9-]+$/);

export const joinRoomSchema = z.object({
  playerId: z.string().trim().min(1),
  preferredSlot: z.union([z.literal(1), z.literal(2)]).optional(),
  sessionId: z.string().trim().min(1),
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

export const startRoomSchema = z.object({
  hostToken: z.string().trim().min(1),
  mode: z.union([z.literal("solo"), z.literal("battle")]),
});

export const publicStartSchema = z.object({
  playerId: z.string().trim().min(1),
  controllerToken: z.string().trim().min(1),
  mode: z.union([z.literal("solo"), z.literal("battle")]),
});

export const hostTokenSchema = z.object({
  hostToken: z.string().trim().min(1),
});

export const resetRoomSchema = z.object({
  hostToken: z.string().trim().min(1),
  reason: z.union([z.literal("completed_cycle"), z.literal("afk"), z.literal("host_reset")]),
});
