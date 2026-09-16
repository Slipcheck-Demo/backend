import type { FastifyInstance } from "fastify";
import { getSports } from "../betway/client";

export function registerSportsRoute(app: FastifyInstance): void {
  app.get("/api/sports", async () => {
    const sports = await getSports();
    return { sports };
  });
}
