export { GameRoom } from "./rooms/game-room";
export { Matchmaker } from "./match/matchmaker";
export { Presence } from "./presence/presence";

// Socket routing (routePartykitRequest + ticket check) lands in Phase 2.
// Until then nothing outside the Worker can reach the Durable Objects.
export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
