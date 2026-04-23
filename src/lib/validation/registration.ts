import { z } from "zod";

export const registrationSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  age: z.number().int().min(13).max(120),
  email: z.email(),
  acceptedTerms: z.literal(true),
  newsletterOptIn: z.boolean(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
