import { z } from "zod";

export const registrationSchema = z
  .object({
    roomCode: z.string().trim().min(4).max(12),
    name: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80).optional(),
    /** @deprecated Legacy clients — use `city` */
    country: z.string().trim().min(2).max(80).optional(),
    age: z.number().int().min(18).max(99),
    email: z.email(),
    acceptedTerms: z.literal(true),
    newsletterOptIn: z.boolean(),
  })
  .transform((data) => ({
    roomCode: data.roomCode,
    name: data.name,
    city: (data.city?.trim() || data.country?.trim() || "").trim(),
    age: data.age,
    email: data.email,
    acceptedTerms: data.acceptedTerms,
    newsletterOptIn: data.newsletterOptIn,
  }))
  .refine((data) => data.city.length >= 2, {
    message: "City must be at least 2 characters",
    path: ["city"],
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;
