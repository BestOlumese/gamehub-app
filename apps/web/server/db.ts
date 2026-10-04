import "server-only";
import { createDb, type Db } from "@gamehub/db";
import { env } from "./env";

let db: Db | undefined;

export function getDb(): Db {
  db ??= createDb(env().DATABASE_URL);
  return db;
}
