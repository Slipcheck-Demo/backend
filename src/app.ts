import Fastify, { type FastifyError } from "fastify";
import { UpstreamError } from "./betway/errors";
import { ApiError } from "./httpErrors";
import { registerCreateRoute } from "./routes/create";
import { registerResolveRoute } from "./routes/resolve";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  registerResolveRoute(app);
  registerCreateRoute(app);

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
