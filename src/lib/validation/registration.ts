import { z } from "zod";
import { getUniversityByName } from "@/lib/data/universities";

const strictEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value), {
    message: "Email must be a valid address",
  });

export const registrationSchema = z
  .object({
    roomCode: z.string().trim().min(4).max(12),
    name: z.string().trim().min(2).max(80),
    university: z.string().trim().min(2).max(120),
    age: z.number().int().min(16).max(126),
    email: strictEmailSchema,
    acceptedTerms: z.literal(true),
    newsletterOptIn: z.boolean(),
  })
  .transform((data) => ({
    roomCode: data.roomCode,
    name: data.name.replace(/\s+/g, " ").trim(),
    university: data.university.trim(),
    age: data.age,
    email: data.email,
    acceptedTerms: data.acceptedTerms,
    newsletterOptIn: data.newsletterOptIn,
  }))
  .refine((data) => Boolean(getUniversityByName(data.university)), {
    message: "Select a valid university.",
    path: ["university"],
  })
  .refine((data) => data.name.split(" ").filter((part) => part.trim().length > 0).length >= 2, {
    message: "Please enter first and last name.",
    path: ["name"],
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;
