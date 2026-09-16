import cors from "@fastify/cors";
import Fastify, { type FastifyError } from "fastify";
import { UpstreamError } from "./betway/errors";
import { ApiError } from "./httpErrors";
import { registerConvertRoute } from "./routes/convert";
import { registerCreateRoute } from "./routes/create";
import { registerEventMarketsRoute } from "./routes/eventMarkets";
import { registerEventsRoute } from "./routes/events";
import { registerResolveRoute } from "./routes/resolve";
import { registerSportsRoute } from "./routes/sports";

export function buildApp() {
  const app = Fastify({ logger: true });

  // Web (Next.js) and mobile (Flutter) clients call this API from a different origin, both
  // in dev and once deployed — allow the configured origin(s), default to local frontend dev.
  // Falls back to the default whenever the parsed list ends up empty (unset, "", or
  // whitespace/commas only) rather than just checking the raw env var is non-empty, so a
  // misconfigured CORS_ORIGIN can't silently resolve to "block every origin".
  const parsedCorsOrigin = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const corsOrigin = parsedCorsOrigin.length > 0 ? parsedCorsOrigin : ["http://localhost:3001"];
  app.register(cors, { origin: corsOrigin });

  app.get("/health", async () => ({ status: "ok" }));

  registerResolveRoute(app);
  registerCreateRoute(app);
  registerConvertRoute(app);
  registerSportsRoute(app);
  registerEventsRoute(app);
  registerEventMarketsRoute(app);

  app.setErrorHandler((error: FastifyError | ApiError | UpstreamError, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.status).send({ error: error.code });
      return;
    }
    if (error instanceof UpstreamError) {
      reply.status(502).send({ error: "upstream_error" });
      return;
    }
    if (error.validation) {
      reply.status(400).send({ error: "validation_error" });
      return;
    }
    app.log.error(error);
    reply.status(500).send({ error: "internal_error" });
  });

  return app;
}
