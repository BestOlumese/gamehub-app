import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Local Postgres (Docker, for dev and E2E) can't speak Neon's HTTP protocol. */
export function isLocalDatabase(databaseUrl: string) {
  const { hostname } = new URL(databaseUrl);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Both drivers share the Postgres query builder; code should only rely on that. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(databaseUrl: string): Db {
  if (isLocalDatabase(databaseUrl)) {
    return drizzlePg({ client: postgres(databaseUrl, { max: 5 }), schema });
  }
  return drizzleNeon({ client: neon(databaseUrl), schema });
}
