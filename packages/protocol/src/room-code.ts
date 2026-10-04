import { z } from "zod";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants";

export const roomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)));
