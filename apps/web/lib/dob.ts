import { z } from "zod";

/** Date-of-birth payload sent with sign-up and onboarding. Never stored. */
export const dobSchema = z.object({
  day: z.coerce.number().int().min(1).max(31),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(2100),
});
