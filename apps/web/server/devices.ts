import "server-only";
import { headers } from "next/headers";
import { describeDevice } from "@/lib/user-agent";
import { getAuth } from "./auth";

export type Device = { id: string; name: string; lastActive: Date; current: boolean };

/** The user's signed-in sessions, without tokens (they never leave the server). */
export async function listDevices(): Promise<Device[]> {
  const h = await headers();
  const auth = getAuth();
  const [current, sessions] = await Promise.all([
    auth.api.getSession({ headers: h }),
    auth.api.listSessions({ headers: h }),
  ]);
  return sessions
    .map((s) => ({
      id: s.id,
      name: describeDevice(s.userAgent),
      lastActive: new Date(s.updatedAt),
      current: s.token === current?.session.token,
    }))
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) || b.lastActive.getTime() - a.lastActive.getTime(),
    );
}
