import { friendsOf } from "@/server/friends";
import { getSession, needsOnboarding } from "@/server/session";

const noStore = { "cache-control": "no-store" };

/** Your friends (for presence and the invite sheet). */
export async function GET() {
  const session = await getSession();
  const user = session?.user;
  if (!user || needsOnboarding(user) || !user.username)
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const { friends, incoming } = await friendsOf(user.id);
  return Response.json({ friends, requests: incoming.length }, { headers: noStore });
}
